import type { DocumentFileType } from '@graph-rag/contracts';

export interface IndexableDocument {
  id: string;
  name: string;
  type: DocumentFileType;
}

/** Every status change is compare-and-set, so a late write cannot overwrite `deleting`. */
export abstract class DocumentStatusRepository {
  /** Returns null when the document is gone, being deleted, or already indexed. */
  abstract startIndexing(id: string): Promise<IndexableDocument | null>;
  abstract setProgress(id: string, chunksTotal: number, chunksDone: number): Promise<void>;
  abstract recordChunkDone(id: string): Promise<void>;
  abstract recordChunkFailed(id: string): Promise<void>;
  /** True when the document is marked for deletion or its row is already gone. */
  abstract isBeingRemoved(id: string): Promise<boolean>;
  abstract markIndexed(id: string): Promise<void>;
  abstract markIndexingFailed(id: string, error: string): Promise<void>;
  abstract markRemovalFailed(id: string, error: string): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
