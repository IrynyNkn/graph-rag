import type { Extraction } from './extraction/extraction.js';

export interface ChunkToWrite extends Extraction {
  id: string;
  documentId: string;
  documentName: string;
  ordinal: number;
  text: string;
}

export abstract class ChunkRepository {
  /** What a redelivered job has already done, so it can resume instead of starting over. */
  abstract findWrittenOrdinals(documentId: string): Promise<Set<number>>;
  /** Writes the chunk with its entities and relations in one transaction. */
  abstract write(chunk: ChunkToWrite): Promise<void>;
}
