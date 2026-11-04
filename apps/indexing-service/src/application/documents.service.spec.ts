import { JobQueues, type Document } from '@graph-rag/contracts';
import { FakeJobPublisher, InMemoryFileStore } from '@graph-rag/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DocumentRepository, type NewDocument } from './document.repository.js';
import { DocumentsService } from './documents.service.js';
import {
  DocumentNotFoundError,
  DocumentNotRetryableError,
  DuplicateDocumentError,
  EmptyDocumentError,
  UnsupportedDocumentTypeError,
} from './errors.js';

class InMemoryDocumentRepository extends DocumentRepository {
  readonly rows = new Map<string, Document & { contentHash: string }>();

  async findAll(): Promise<Document[]> {
    return [...this.rows.values()];
  }

  async findById(id: string): Promise<Document | null> {
    return this.rows.get(id) ?? null;
  }

  async insert(document: NewDocument): Promise<Document | null> {
    const duplicate = [...this.rows.values()].some(
      (row) => row.contentHash === document.contentHash,
    );
    if (duplicate) {
      return null;
    }
    const now = new Date().toISOString();
    const row = {
      ...document,
      id: `document-${this.rows.size + 1}`,
      status: 'queued' as const,
      chunksTotal: 0,
      chunksDone: 0,
      chunksFailed: 0,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async markDeleting(id: string): Promise<Document | null> {
    return this.patch(id, { status: 'deleting', error: null });
  }

  async requeue(id: string): Promise<Document | null> {
    const row = this.rows.get(id);
    const retryable =
      row?.status === 'failed' || (row?.status === 'indexed' && row.chunksFailed > 0);
    return retryable ? this.patch(id, { status: 'queued', error: null }) : null;
  }

  async markFailed(id: string, error: string): Promise<Document | null> {
    return this.patch(id, { status: 'failed', error });
  }

  private patch(id: string, changes: Partial<Document>): Document | null {
    const row = this.rows.get(id);
    if (row === undefined) {
      return null;
    }
    const updated = { ...row, ...changes };
    this.rows.set(id, updated);
    return updated;
  }
}

describe('DocumentsService', () => {
  const content = Buffer.from('Alice manages the team.');
  let repository: InMemoryDocumentRepository;
  let files: InMemoryFileStore;
  let jobs: FakeJobPublisher;
  let service: DocumentsService;

  beforeEach(() => {
    repository = new InMemoryDocumentRepository();
    files = new InMemoryFileStore();
    jobs = new FakeJobPublisher();
    service = new DocumentsService(repository, files, jobs);
  });

  describe('upload', () => {
    it('stores the file and queues an indexing job', async () => {
      const document = await service.upload({ name: 'Report.TXT', content });

      expect(document).toMatchObject({ name: 'Report.TXT', type: 'txt', status: 'queued' });
      expect(document.sizeBytes).toBe(content.length);
      expect(files.files.get(document.id)).toEqual(content);
      expect(jobs.published).toEqual([
        { queue: JobQueues.indexDocument, job: { documentId: document.id } },
      ]);
    });

    it('rejects a file type without a parser', async () => {
      await expect(service.upload({ name: 'image.png', content })).rejects.toThrow(
        UnsupportedDocumentTypeError,
      );
      expect(repository.rows.size).toBe(0);
    });

    it('rejects an empty file', async () => {
      await expect(service.upload({ name: 'a.txt', content: Buffer.alloc(0) })).rejects.toThrow(
        EmptyDocumentError,
      );
    });

    it('rejects content that was already uploaded and queues nothing', async () => {
      await service.upload({ name: 'first.md', content });
      jobs.published.length = 0;

      await expect(service.upload({ name: 'second.md', content })).rejects.toThrow(
        DuplicateDocumentError,
      );
      expect(jobs.published).toEqual([]);
      expect(files.files.size).toBe(1);
    });

    it('leaves no row behind when the file cannot be saved', async () => {
      files.saveFailure = new Error('disk full');

      await expect(service.upload({ name: 'a.pdf', content })).rejects.toThrow('disk full');
      expect(repository.rows.size).toBe(0);
    });

    it('marks the document failed when the job cannot be queued', async () => {
      jobs.failure = new Error('broker down');

      const document = await service.upload({ name: 'a.pdf', content });

      expect(document.status).toBe('failed');
      expect(document.error).toBe('Could not queue the job');
    });
  });

  describe('requestRemoval', () => {
    it('marks the document deleting and queues a removal job', async () => {
      const { id } = await service.upload({ name: 'a.txt', content });

      const document = await service.requestRemoval(id);

      expect(document.status).toBe('deleting');
      expect(jobs.published.at(-1)).toEqual({
        queue: JobQueues.removeDocument,
        job: { documentId: id },
      });
    });

    it('fails for an unknown document', async () => {
      await expect(service.requestRemoval('missing')).rejects.toThrow(DocumentNotFoundError);
    });

    it('marks the document failed when the job cannot be queued', async () => {
      const { id } = await service.upload({ name: 'a.txt', content });
      jobs.failure = new Error('broker down');

      const document = await service.requestRemoval(id);

      expect(document.status).toBe('failed');
    });
  });

  describe('retry', () => {
    it('requeues a failed document', async () => {
      const { id } = await service.upload({ name: 'a.txt', content });
      await repository.markFailed(id, 'provider down');
      jobs.published.length = 0;

      const document = await service.retry(id);

      expect(document).toMatchObject({ status: 'queued', error: null });
      expect(jobs.published).toEqual([{ queue: JobQueues.indexDocument, job: { documentId: id } }]);
    });

    it('rejects a document with nothing to retry', async () => {
      const { id } = await service.upload({ name: 'a.txt', content });

      await expect(service.retry(id)).rejects.toThrow(DocumentNotRetryableError);
    });

    it('fails for an unknown document', async () => {
      await expect(service.retry('missing')).rejects.toThrow(DocumentNotFoundError);
    });
  });

  it('lists documents', async () => {
    await service.upload({ name: 'a.txt', content });

    await expect(service.list()).resolves.toHaveLength(1);
  });
});
