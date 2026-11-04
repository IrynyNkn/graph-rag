import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobQueues, type DocumentStatus } from '@graph-rag/contracts';
import { GraphStore } from '@graph-rag/graph-store';
import {
  ChatModel,
  Embedder,
  InvalidModelOutputError,
  ModelUnavailableError,
  type ChatRequest,
} from '@graph-rag/inference';
import { JobPublisher } from '@graph-rag/job-queue';
import { documents, eq, RelationalStore } from '@graph-rag/relational-store';
import { FakeChatModel, FakeEmbedder, publishRawJob, purgeQueues } from '@graph-rag/testing';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import type { Extraction } from '../../src/application/indexing/extraction/extraction.js';
import { testConfig } from '../test-config.js';

const WAIT = { timeout: 30_000, interval: 50 };
const TWO_CHUNKS =
  'Alice manages the team now, and has done so for years.\n\n' +
  'Bob reviews all of the code, and he does that very well.';

const person = (name: string, description: string) => ({
  name,
  type: 'PERSON' as const,
  description,
});
const team = (name: string, description: string) => ({
  name,
  type: 'TEAM' as const,
  description,
});

describe('document jobs', () => {
  const stores = inject('stores');
  let moduleRef: TestingModule;
  let directory: string;
  let respond: (request: ChatRequest) => unknown;
  let embedder: FakeEmbedder;
  let graph: GraphStore;
  let relational: RelationalStore;
  let publisher: JobPublisher;

  const chat = new FakeChatModel((request) => respond(request));

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'indexing-worker-'));
    embedder = new FakeEmbedder(3);
    moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.forRoot(
          testConfig({
            POSTGRES_URL: stores.postgresUrl,
            RABBITMQ_URL: stores.rabbitMqUrl,
            NEO4J_URI: stores.neo4j.uri,
            NEO4J_USER: stores.neo4j.user,
            NEO4J_PASSWORD: stores.neo4j.password,
            FILE_STORE_DIRECTORY: directory,
            CHUNK_MAX_CHARS: '60',
            CHUNK_OVERLAP_CHARS: '0',
          }),
        ),
      ],
    })
      .overrideProvider(ChatModel)
      .useValue(chat)
      .overrideProvider(Embedder)
      .useValue(embedder)
      .compile();
    moduleRef.useLogger(false);
    await purgeQueues(stores.rabbitMqUrl, Object.values(JobQueues));
    await moduleRef.init();
    graph = moduleRef.get(GraphStore);
    relational = moduleRef.get(RelationalStore);
    publisher = moduleRef.get(JobPublisher);
  });

  afterAll(async () => {
    await moduleRef.close();
    await rm(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    chat.requests.length = 0;
    embedder.documentBatches.length = 0;
    respond = () => ({ entities: [], triples: [] });
    await graph.write('MATCH (n) DETACH DELETE n');
    await relational.db.delete(documents);
  });

  /** Stands in for indexing-service: a row, a file and a job. */
  async function submit(name: string, text: string): Promise<string> {
    const [row] = await relational.db
      .insert(documents)
      .values({
        name,
        contentHash: name,
        type: 'txt',
        sizeBytes: text.length,
        status: 'queued',
      })
      .returning();
    const id = row!.id;
    await writeFile(join(directory, id), text);
    await publisher.publish(JobQueues.indexDocument, { documentId: id });
    return id;
  }

  async function findRow(id: string) {
    const [row] = await relational.db.select().from(documents).where(eq(documents.id, id));
    return row;
  }

  function waitForStatus(id: string, status: DocumentStatus) {
    return vi.waitFor(async () => {
      const row = await findRow(id);
      expect(row?.status).toBe(status);
      return row!;
    }, WAIT);
  }

  async function remove(id: string): Promise<void> {
    await relational.db.update(documents).set({ status: 'deleting' }).where(eq(documents.id, id));
    await publisher.publish(JobQueues.removeDocument, { documentId: id });
  }

  function waitForRowGone(id: string) {
    return vi.waitFor(async () => {
      expect(await findRow(id)).toBeUndefined();
    }, WAIT);
  }

  /** Replies to extraction by the chunk's text, and says no to every resolution question. */
  function replyByText(extractions: Record<string, Extraction>): void {
    respond = (request) => {
      const prompt = request.messages.map((message) => message.content).join('\n');
      if (prompt.includes('sameEntity')) {
        return { reasoning: 'Different.', sameEntity: false };
      }
      const key = Object.keys(extractions).find((text) => prompt.includes(text));
      return key ? extractions[key] : { entities: [], triples: [] };
    };
  }

  const countOf = async (query: string, parameters = {}) => {
    const [row] = await graph.read(query, parameters);
    return row?.['count'];
  };

  describe('indexing', () => {
    it('builds the graph, refreshes entities and marks the document indexed', async () => {
      replyByText({
        'Alice manages': {
          entities: [person('Alice', 'Alice manages the team.'), team('Team', 'The team.')],
          triples: [{ subject: 'Alice', relation: 'manages', object: 'Team' }],
        },
      });

      const id = await submit('handbook.txt', 'Alice manages the team.');
      const row = await waitForStatus(id, 'indexed');

      expect(row).toMatchObject({ chunksTotal: 1, chunksDone: 1, chunksFailed: 0, error: null });
      const [chunk] = await graph.read(
        'MATCH (c:Chunk {documentId: $id}) RETURN c.id AS id, c.ordinal AS ordinal, c.text AS text, c.documentName AS documentName',
        { id },
      );
      expect(chunk).toEqual({
        id: `${id}:0`,
        ordinal: 0,
        text: 'Alice manages the team.',
        documentName: 'handbook.txt',
      });
      const [alice] = await graph.read(
        `MATCH (e:Entity {name: 'alice'})
         RETURN e.description AS description, e.type AS type,
                e.revision = e.refreshedRevision AS fresh,
                size(e.descriptionEmbedding) AS dimension`,
      );
      expect(alice).toEqual({
        description: 'Alice manages the team.',
        type: 'PERSON',
        fresh: true,
        dimension: 3,
      });
      const [relation] = await graph.read(
        `MATCH (:Entity {name: 'alice'})-[r:RELATES_TO]->(:Entity {name: 'team'})
         RETURN r.relations AS relations, r.chunkIds AS chunkIds`,
      );
      expect(relation).toEqual({ relations: ['manages'], chunkIds: [`${id}:0`] });
    });

    it('accumulates relations and descriptions across documents', async () => {
      replyByText({
        'Alice manages': {
          entities: [person('Alice', 'Manages.'), team('Team', 'A team.')],
          triples: [{ subject: 'Alice', relation: 'manages', object: 'Team' }],
        },
        'Alice founded': {
          entities: [person('Alice', 'Founder.'), team('Team', 'A startup.')],
          triples: [{ subject: 'Alice', relation: 'founded', object: 'Team' }],
        },
      });

      const first = await submit('a.txt', 'Alice manages the team.');
      await waitForStatus(first, 'indexed');
      const second = await submit('b.txt', 'Alice founded the team.');
      await waitForStatus(second, 'indexed');

      const [relation] = await graph.read(
        `MATCH (:Entity {name: 'alice'})-[r:RELATES_TO]->(:Entity {name: 'team'})
         RETURN r.relations AS relations, r.chunkIds AS chunkIds`,
      );
      expect(relation).toEqual({
        relations: ['manages', 'founded'],
        chunkIds: [`${first}:0`, `${second}:0`],
      });
      const [alice] = await graph.read(
        `MATCH (e:Entity {name: 'alice'}) RETURN e.description AS description`,
      );
      expect(alice?.['description']).toBe('Founder. | Manages.');
    });

    it('fails on a provider outage and resumes on retry without repeating chunks', async () => {
      let extractionCalls = 0;
      respond = () => {
        extractionCalls += 1;
        return extractionCalls === 2
          ? new ModelUnavailableError('provider down')
          : { entities: [person('Alice', 'Someone.')], triples: [] };
      };

      const id = await submit('two-chunks.txt', TWO_CHUNKS);
      const failed = await waitForStatus(id, 'failed');
      expect(failed).toMatchObject({ error: 'provider down', chunksTotal: 2, chunksDone: 1 });
      expect(extractionCalls).toBe(2);

      await relational.db.update(documents).set({ status: 'queued' }).where(eq(documents.id, id));
      await publisher.publish(JobQueues.indexDocument, { documentId: id });
      const indexed = await waitForStatus(id, 'indexed');

      expect(indexed).toMatchObject({ chunksDone: 2, chunksFailed: 0, error: null });
      expect(extractionCalls).toBe(3);
      await expect(
        countOf('MATCH (c:Chunk {documentId: $id}) RETURN count(c) AS count', { id }),
      ).resolves.toBe(2);
    });

    it('counts a chunk with invalid output and leaves it unwritten for a retry', async () => {
      respond = (request) =>
        request.messages.some((message) => message.content.includes('Bob'))
          ? new InvalidModelOutputError('not JSON')
          : { entities: [person('Alice', 'Someone.')], triples: [] };

      const id = await submit('partial.txt', TWO_CHUNKS);
      const row = await waitForStatus(id, 'indexed');

      expect(row).toMatchObject({ chunksTotal: 2, chunksDone: 1, chunksFailed: 1 });
      await expect(
        countOf('MATCH (c:Chunk {documentId: $id}) RETURN count(c) AS count', { id }),
      ).resolves.toBe(1);
    });

    it('fails a document whose chunks all have invalid output', async () => {
      respond = () => new InvalidModelOutputError('not JSON');

      const id = await submit('bad.txt', 'Alice manages the team.');

      const row = await waitForStatus(id, 'failed');
      expect(row.error).toContain('invalid output');
    });

    it('fails with a clear error when the file is missing', async () => {
      const [row] = await relational.db
        .insert(documents)
        .values({
          name: 'gone.txt',
          contentHash: 'gone',
          type: 'txt',
          sizeBytes: 1,
          status: 'queued',
        })
        .returning();

      await publisher.publish(JobQueues.indexDocument, { documentId: row!.id });

      const failed = await waitForStatus(row!.id, 'failed');
      expect(failed.error).toContain('ENOENT');
    });

    it('merges a confirmed alias into the existing entity', async () => {
      respond = (request) => {
        const prompt = request.messages.map((message) => message.content).join('\n');
        if (prompt.includes('sameEntity')) {
          return { reasoning: 'Same.', sameEntity: true };
        }
        return prompt.includes('Owen Blackwood leads')
          ? { entities: [person('Owen Blackwood', 'Leads search.')], triples: [] }
          : { entities: [person('Owen', 'Runs the search team.')], triples: [] };
      };

      const first = await submit('a.txt', 'Owen Blackwood leads search.');
      await waitForStatus(first, 'indexed');
      const second = await submit('b.txt', 'Owen runs the search team.');
      await waitForStatus(second, 'indexed');

      const entities = await graph.read('MATCH (e:Entity) RETURN e.name AS name');
      expect(entities).toEqual([{ name: 'owen blackwood' }]);
      await expect(
        countOf(
          `MATCH (:Chunk)-[m:MENTIONS]->(:Entity {name: 'owen blackwood'}) RETURN count(m) AS count`,
        ),
      ).resolves.toBe(2);
    });

    it('finds candidates for names with search syntax in them', async () => {
      respond = (request) => {
        const prompt = request.messages.map((message) => message.content).join('\n');
        if (prompt.includes('sameEntity')) {
          return { reasoning: 'Different.', sameEntity: false };
        }
        return prompt.includes('Lab')
          ? { entities: [team('R&D (Lab)', 'A lab.')], triples: [] }
          : { entities: [team('R&D', 'A team.')], triples: [] };
      };

      const first = await submit('a.txt', 'R&D does research.');
      await waitForStatus(first, 'indexed');
      const second = await submit('b.txt', 'The R&D Lab does research.');

      await expect(waitForStatus(second, 'indexed')).resolves.toMatchObject({ error: null });
    });

    it('drops a malformed job and goes on with the next one', async () => {
      await publishRawJob(stores.rabbitMqUrl, JobQueues.indexDocument, 'not json');
      await publishRawJob(stores.rabbitMqUrl, JobQueues.indexDocument, '{"documentId":"nope"}');

      const id = await submit('after.txt', 'Alice manages the team.');

      await waitForStatus(id, 'indexed');
    });
  });

  describe('removal', () => {
    async function indexTwoDocumentsSharingEntities(): Promise<{ first: string; second: string }> {
      replyByText({
        'Alice manages': {
          entities: [
            person('Alice', 'Alice manages the team.'),
            team('Team', 'Managed by Alice.'),
            team('Billing', 'Owned by the team.'),
          ],
          triples: [
            { subject: 'Alice', relation: 'manages', object: 'Team' },
            { subject: 'Team', relation: 'owns', object: 'Billing' },
          ],
        },
        'Bob joined': {
          entities: [
            person('Bob', 'Bob joined the team.'),
            team('Team', 'Bob works here.'),
            team('Billing', 'Run by the team.'),
          ],
          triples: [
            { subject: 'Bob', relation: 'member of', object: 'Team' },
            { subject: 'Team', relation: 'runs', object: 'Billing' },
          ],
        },
      });
      const first = await submit('a.txt', 'Alice manages the team.');
      await waitForStatus(first, 'indexed');
      const second = await submit('b.txt', 'Bob joined the team.');
      await waitForStatus(second, 'indexed');
      return { first, second };
    }

    it('removes only what belonged to the document', async () => {
      const { first, second } = await indexTwoDocumentsSharingEntities();
      embedder.documentBatches.length = 0;

      await remove(first);
      await waitForRowGone(first);

      const entities = await graph.read('MATCH (e:Entity) RETURN e.name AS name ORDER BY name');
      expect(entities.map((row) => row['name'])).toEqual(['billing', 'bob', 'team']);

      const [shared] = await graph.read(
        `MATCH (:Entity {name: 'team'})-[r:RELATES_TO]->(:Entity {name: 'billing'})
         RETURN r.relations AS relations, r.chunkIds AS chunkIds`,
      );
      expect(shared).toEqual({ relations: ['runs'], chunkIds: [`${second}:0`] });

      await expect(
        countOf(`MATCH (:Entity {name: 'alice'})-[r]-() RETURN count(r) AS count`),
      ).resolves.toBe(0);
      await expect(
        countOf('MATCH (c:Chunk {documentId: $first}) RETURN count(c) AS count', { first }),
      ).resolves.toBe(0);
      await expect(findRow(second)).resolves.toMatchObject({ status: 'indexed' });
    });

    it('rebuilds and re-embeds descriptions of the entities that stay', async () => {
      const { first } = await indexTwoDocumentsSharingEntities();
      embedder.documentBatches.length = 0;

      await remove(first);
      await waitForRowGone(first);

      const [teamRow] = await graph.read(
        `MATCH (e:Entity {name: 'team'})
         RETURN e.description AS description, e.revision = e.refreshedRevision AS fresh`,
      );
      expect(teamRow).toEqual({ description: 'Bob works here.', fresh: true });
      expect(embedder.documentBatches.flat()).toContain('team: Bob works here.');
    });

    it('deletes the file', async () => {
      const id = await submit('a.txt', 'Alice manages the team.');
      await waitForStatus(id, 'indexed');

      await remove(id);
      await waitForRowGone(id);

      await expect(access(join(directory, id))).rejects.toThrow('ENOENT');
    });

    it('survives a repeated job', async () => {
      const { first, second } = await indexTwoDocumentsSharingEntities();

      await remove(first);
      await waitForRowGone(first);
      await publisher.publish(JobQueues.removeDocument, { documentId: first });

      await vi.waitFor(async () => {
        const [row] = await graph.read(
          `MATCH (:Entity {name: 'team'})-[r:RELATES_TO]->(:Entity {name: 'billing'})
           RETURN r.chunkIds AS chunkIds`,
        );
        expect(row?.['chunkIds']).toEqual([`${second}:0`]);
      }, WAIT);
      await expect(findRow(second)).resolves.toMatchObject({ status: 'indexed' });
    });

    it('cleans up when the document is deleted during indexing', async () => {
      let extractions = 0;
      let id = '';
      respond = () => {
        extractions += 1;
        if (extractions === 1) {
          // Deleting while the chunk is being extracted: its write comes after the removal job.
          void remove(id);
        }
        return { entities: [person('Alice', 'Someone.')], triples: [] };
      };

      id = await submit('racing.txt', TWO_CHUNKS);
      await waitForRowGone(id);

      await vi.waitFor(async () => {
        await expect(
          countOf('MATCH (c:Chunk {documentId: $id}) RETURN count(c) AS count', { id }),
        ).resolves.toBe(0);
        await expect(countOf('MATCH (e:Entity) RETURN count(e) AS count')).resolves.toBe(0);
      }, WAIT);
    });
  });
});
