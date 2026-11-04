import type { Document, DocumentFileType } from '@graph-rag/contracts';

export interface NewDocument {
  name: string;
  contentHash: string;
  type: DocumentFileType;
  sizeBytes: number;
}

export abstract class DocumentRepository {
  abstract findAll(): Promise<Document[]>;
  abstract findById(id: string): Promise<Document | null>;
  /** Returns null when a document with the same content already exists. */
  abstract insert(document: NewDocument): Promise<Document | null>;
  abstract delete(id: string): Promise<void>;
  /** Returns null when the document does not exist. */
  abstract markDeleting(id: string): Promise<Document | null>;
  /** Moves a document with something left to index back to queued, otherwise returns null. */
  abstract requeue(id: string): Promise<Document | null>;
  abstract markFailed(id: string, error: string): Promise<Document | null>;
}
