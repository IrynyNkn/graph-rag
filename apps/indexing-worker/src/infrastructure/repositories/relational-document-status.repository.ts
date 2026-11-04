import { and, documents, eq, inArray, RelationalStore, sql } from '@graph-rag/relational-store';
import { Injectable } from '@nestjs/common';
import {
  DocumentStatusRepository,
  type IndexableDocument,
} from '../../application/document-status.repository.js';

@Injectable()
export class RelationalDocumentStatusRepository extends DocumentStatusRepository {
  constructor(private readonly store: RelationalStore) {
    super();
  }

  /** `failed` is allowed because a job whose acknowledgement got lost is delivered again. */
  async startIndexing(id: string): Promise<IndexableDocument | null> {
    const [row] = await this.store.db
      .update(documents)
      .set({ status: 'indexing', error: null, chunksFailed: 0, updatedAt: new Date() })
      .where(and(eq(documents.id, id), inArray(documents.status, ['queued', 'indexing', 'failed'])))
      .returning({ id: documents.id, name: documents.name, type: documents.type });
    return row ?? null;
  }

  async setProgress(id: string, chunksTotal: number, chunksDone: number): Promise<void> {
    await this.store.db
      .update(documents)
      .set({ chunksTotal, chunksDone, updatedAt: new Date() })
      .where(eq(documents.id, id));
  }

  async recordChunkDone(id: string): Promise<void> {
    await this.store.db
      .update(documents)
      .set({ chunksDone: sql`${documents.chunksDone} + 1`, updatedAt: new Date() })
      .where(eq(documents.id, id));
  }

  async recordChunkFailed(id: string): Promise<void> {
    await this.store.db
      .update(documents)
      .set({ chunksFailed: sql`${documents.chunksFailed} + 1`, updatedAt: new Date() })
      .where(eq(documents.id, id));
  }

  async isBeingRemoved(id: string): Promise<boolean> {
    const [row] = await this.store.db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.id, id));
    return row === undefined || row.status === 'deleting';
  }

  async markIndexed(id: string): Promise<void> {
    await this.store.db
      .update(documents)
      .set({ status: 'indexed', updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.status, 'indexing')));
  }

  async markIndexingFailed(id: string, error: string): Promise<void> {
    await this.store.db
      .update(documents)
      .set({ status: 'failed', error, updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.status, 'indexing')));
  }

  async markRemovalFailed(id: string, error: string): Promise<void> {
    await this.store.db
      .update(documents)
      .set({ status: 'failed', error, updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.status, 'deleting')));
  }

  async delete(id: string): Promise<void> {
    await this.store.db.delete(documents).where(eq(documents.id, id));
  }
}
