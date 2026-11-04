import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { documentSchema, JobQueues } from '@graph-rag/contracts';
import { documents, RelationalStore } from '@graph-rag/relational-store';
import { purgeQueues, takeJob } from '@graph-rag/testing';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { AppConfig } from '../../src/config.js';

const MAX_UPLOAD_BYTES = 1024;

describe('documents API', () => {
  const stores = inject('stores');
  let app: INestApplication;
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'indexing-service-'));
    const config = AppConfig.fromEnv({
      POSTGRES_URL: stores.postgresUrl,
      RABBITMQ_URL: stores.rabbitMqUrl,
      FILE_STORE_DIRECTORY: directory,
      MAX_UPLOAD_BYTES: String(MAX_UPLOAD_BYTES),
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(config)],
    }).compile();
    moduleRef.useLogger(false);
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await app.get(RelationalStore).db.delete(documents);
    await purgeQueues(stores.rabbitMqUrl, Object.values(JobQueues));
  });

  function upload(name: string, content: string) {
    return request(app.getHttpServer())
      .post('/documents')
      .attach('file', Buffer.from(content), name);
  }

  it('stores an upload and queues a job', async () => {
    const response = await upload('report.txt', 'Alice manages the team.').expect(201);

    const document = documentSchema.parse(response.body);
    expect(document).toMatchObject({ name: 'report.txt', type: 'txt', status: 'queued' });
    await expect(readFile(join(directory, document.id), 'utf8')).resolves.toBe(
      'Alice manages the team.',
    );
    await expect(takeJob(stores.rabbitMqUrl, JobQueues.indexDocument)).resolves.toEqual({
      documentId: document.id,
    });
  });

  it('keeps a non-ASCII file name intact', async () => {
    const response = await upload('Звіт.md', '# Title').expect(201);

    expect(documentSchema.parse(response.body).name).toBe('Звіт.md');
  });

  it('maps application errors to HTTP statuses', async () => {
    await upload('report.txt', 'content').expect(201);

    await upload('copy.txt', 'content').expect(409);
    await upload('image.png', 'content').expect(415);
    await upload('empty.txt', '').expect(400);
    await request(app.getHttpServer()).post('/documents').expect(400);
    await request(app.getHttpServer())
      .delete('/documents/6a3f3f62-0a4c-4f7e-9a53-000000000000')
      .expect(404);
    await request(app.getHttpServer()).delete('/documents/not-a-uuid').expect(400);
  });

  it('rejects a file over the size limit', async () => {
    await upload('big.txt', 'x'.repeat(MAX_UPLOAD_BYTES + 1)).expect(413);
  });

  it('lists documents, newest first', async () => {
    await upload('first.txt', 'one').expect(201);
    await upload('second.txt', 'two').expect(201);

    const response = await request(app.getHttpServer()).get('/documents').expect(200);

    expect(
      documentSchema
        .array()
        .parse(response.body)
        .map((document) => document.name),
    ).toEqual(['second.txt', 'first.txt']);
  });

  it('marks a document deleting and queues its removal', async () => {
    const { body } = await upload('report.txt', 'content').expect(201);

    const response = await request(app.getHttpServer()).delete(`/documents/${body.id}`).expect(202);

    expect(documentSchema.parse(response.body).status).toBe('deleting');
    await expect(takeJob(stores.rabbitMqUrl, JobQueues.removeDocument)).resolves.toEqual({
      documentId: body.id,
    });
  });

  it('retries only documents with something left to index', async () => {
    const { body } = await upload('report.txt', 'content').expect(201);
    await request(app.getHttpServer()).post(`/documents/${body.id}/retry`).expect(409);

    await app.get(RelationalStore).db.update(documents).set({ status: 'failed' });
    const failed = await request(app.getHttpServer())
      .post(`/documents/${body.id}/retry`)
      .expect(202);
    expect(documentSchema.parse(failed.body).status).toBe('queued');

    await app.get(RelationalStore).db.update(documents).set({ status: 'indexed', chunksFailed: 2 });
    const partial = await request(app.getHttpServer())
      .post(`/documents/${body.id}/retry`)
      .expect(202);
    expect(documentSchema.parse(partial.body).status).toBe('queued');
  });

  it('answers the health check', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });
});
