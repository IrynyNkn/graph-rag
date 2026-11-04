import type { DocumentFileType, DocumentStatus } from '@graph-rag/contracts';
import {
  DocumentStatusRepository,
  type IndexableDocument,
} from '../src/application/document-status.repository.js';

export interface FakeDocumentRow {
  id: string;
  name: string;
  type: DocumentFileType;
  status: DocumentStatus;
  chunksTotal: number;
  chunksDone: number;
  chunksFailed: number;
  error: string | null;
}

const STARTABLE: ReadonlySet<DocumentStatus> = new Set(['queued', 'indexing', 'failed']);

export class FakeDocumentStatusRepository extends DocumentStatusRepository {
  readonly rows = new Map<string, FakeDocumentRow>();

  add(row: Partial<FakeDocumentRow> & { id: string }): void {
    this.rows.set(row.id, {
      name: `${row.id}.txt`,
      type: 'txt',
      status: 'queued',
      chunksTotal: 0,
      chunksDone: 0,
      chunksFailed: 0,
      error: null,
      ...row,
    });
  }

  async startIndexing(id: string): Promise<IndexableDocument | null> {
    const row = this.rows.get(id);
    if (row === undefined || !STARTABLE.has(row.status)) {
      return null;
    }
    Object.assign(row, { status: 'indexing', error: null, chunksFailed: 0 });
    return { id, name: row.name, type: row.type };
  }

  async setProgress(id: string, chunksTotal: number, chunksDone: number): Promise<void> {
    this.patch(id, { chunksTotal, chunksDone });
  }

  async recordChunkDone(id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) {
      row.chunksDone += 1;
    }
  }

  async recordChunkFailed(id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) {
      row.chunksFailed += 1;
    }
  }

  async isBeingRemoved(id: string): Promise<boolean> {
    const row = this.rows.get(id);
    return row === undefined || row.status === 'deleting';
  }

  async markIndexed(id: string): Promise<void> {
    this.transition(id, 'indexing', { status: 'indexed' });
  }

  async markIndexingFailed(id: string, error: string): Promise<void> {
    this.transition(id, 'indexing', { status: 'failed', error });
  }

  async markRemovalFailed(id: string, error: string): Promise<void> {
    this.transition(id, 'deleting', { status: 'failed', error });
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  private transition(id: string, from: DocumentStatus, changes: Partial<FakeDocumentRow>): void {
    if (this.rows.get(id)?.status === from) {
      this.patch(id, changes);
    }
  }

  private patch(id: string, changes: Partial<FakeDocumentRow>): void {
    const row = this.rows.get(id);
    if (row) {
      Object.assign(row, changes);
    }
  }
}
