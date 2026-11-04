import { InvalidModelOutputError, ModelUnavailableError } from '@graph-rag/inference';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDocumentStatusRepository } from '../../../test/fake-document-status.repository.js';
import { testConfig } from '../../../test/test-config.js';
import type { KnowledgeRefresher } from '../knowledge/knowledge-refresher.js';
import type { RemovalService } from '../removal/removal.service.js';
import type { ChunkIndexer } from './chunk-indexer.js';
import { ChunkRepository, type ChunkToWrite } from './chunk.repository.js';
import type { DocumentChunk, DocumentChunker } from './chunking/document-chunker.js';
import { IndexingService } from './indexing.service.js';
import type { DocumentReader } from './parsing/document-reader.js';

class FakeChunkRepository extends ChunkRepository {
  written = new Set<number>();

  async findWrittenOrdinals(): Promise<Set<number>> {
    return this.written;
  }

  async write(_chunk: ChunkToWrite): Promise<void> {
    throw new Error('ChunkIndexer is faked in this test');
  }
}

const chunksOf = (count: number): DocumentChunk[] =>
  Array.from({ length: count }, (_, ordinal) => ({
    ordinal,
    text: `Chunk ${ordinal}.`,
    headingPath: [],
  }));

describe('IndexingService', () => {
  const id = 'doc';
  let documents: FakeDocumentStatusRepository;
  let chunks: FakeChunkRepository;
  let chunkCount: number;
  let indexChunk: (chunk: DocumentChunk) => Promise<void>;
  let readError: Error | null;
  let refreshes: number;
  let removals: string[];
  let service: IndexingService;

  beforeEach(() => {
    documents = new FakeDocumentStatusRepository();
    documents.add({ id });
    chunks = new FakeChunkRepository();
    chunkCount = 3;
    indexChunk = async () => undefined;
    readError = null;
    refreshes = 0;
    removals = [];
    service = new IndexingService(
      documents,
      {
        read: async () => {
          if (readError) {
            throw readError;
          }
          return { blocks: [] };
        },
      } as unknown as DocumentReader,
      { chunk: () => chunksOf(chunkCount) } as unknown as DocumentChunker,
      chunks,
      {
        index: (_document: unknown, chunk: DocumentChunk) => indexChunk(chunk),
      } as unknown as ChunkIndexer,
      {
        refresh: async () => {
          refreshes += 1;
        },
      } as unknown as KnowledgeRefresher,
      {
        remove: async (documentId: string) => {
          removals.push(documentId);
        },
      } as unknown as RemovalService,
      testConfig(),
    );
  });

  it('indexes all chunks, refreshes once and marks the document indexed', async () => {
    await service.index(id);

    expect(documents.rows.get(id)).toMatchObject({
      status: 'indexed',
      chunksTotal: 3,
      chunksDone: 3,
      chunksFailed: 0,
    });
    expect(refreshes).toBe(1);
  });

  it.each(['indexed', 'deleting'] as const)('skips a document that is %s', async (status) => {
    documents.add({ id, status });
    let called = false;
    indexChunk = async () => {
      called = true;
    };

    await service.index(id);

    expect(called).toBe(false);
    expect(documents.rows.get(id)?.status).toBe(status);
  });

  it('skips a document that is gone', async () => {
    await expect(service.index('missing')).resolves.toBeUndefined();
    expect(refreshes).toBe(0);
  });

  it('resumes from the chunks already written', async () => {
    chunks.written = new Set([0, 1]);
    const indexed: number[] = [];
    indexChunk = async (chunk) => {
      indexed.push(chunk.ordinal);
    };

    await service.index(id);

    expect(indexed).toEqual([2]);
    expect(documents.rows.get(id)).toMatchObject({ chunksDone: 3, status: 'indexed' });
  });

  it('counts a chunk with invalid output and goes on', async () => {
    indexChunk = async (chunk) => {
      if (chunk.ordinal === 1) {
        throw new InvalidModelOutputError('not JSON');
      }
    };

    await service.index(id);

    expect(documents.rows.get(id)).toMatchObject({
      status: 'indexed',
      chunksDone: 2,
      chunksFailed: 1,
    });
  });

  it('fails the document when no chunk could be indexed', async () => {
    indexChunk = async () => {
      throw new InvalidModelOutputError('not JSON');
    };

    await service.index(id);

    expect(documents.rows.get(id)?.status).toBe('failed');
    expect(documents.rows.get(id)?.error).toContain('all 3 chunks');
    expect(refreshes).toBe(0);
  });

  it('fails the document when the provider is unavailable, and stops at once', async () => {
    let attempts = 0;
    indexChunk = async () => {
      attempts += 1;
      throw new ModelUnavailableError('provider down');
    };

    await service.index(id);

    expect(attempts).toBe(1);
    expect(documents.rows.get(id)).toMatchObject({ status: 'failed', error: 'provider down' });
  });

  it('fails the document when it cannot be parsed', async () => {
    readError = new Error('no text layer');

    await service.index(id);

    expect(documents.rows.get(id)).toMatchObject({ status: 'failed', error: 'no text layer' });
  });

  it('stops and removes the document when it was deleted during a chunk', async () => {
    const indexed: number[] = [];
    indexChunk = async (chunk) => {
      indexed.push(chunk.ordinal);
      documents.rows.get(id)!.status = 'deleting';
    };

    await service.index(id);

    expect(indexed).toEqual([0]);
    expect(removals).toEqual([id]);
    expect(refreshes).toBe(0);
    expect(documents.rows.get(id)?.status).toBe('deleting');
  });

  it('removes the document when its row disappeared during a chunk', async () => {
    indexChunk = async () => {
      documents.rows.delete(id);
    };

    await service.index(id);

    expect(removals).toEqual([id]);
  });

  it('does not overwrite deleting when a failure comes late', async () => {
    indexChunk = async () => {
      documents.rows.get(id)!.status = 'deleting';
      throw new ModelUnavailableError('provider down');
    };

    await service.index(id);

    expect(documents.rows.get(id)?.status).toBe('deleting');
  });
});
