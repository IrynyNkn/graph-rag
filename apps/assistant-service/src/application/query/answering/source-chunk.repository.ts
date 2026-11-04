import type { Citation } from '@graph-rag/contracts';

export abstract class SourceChunkRepository {
  /** Returns chunks in the order of `ids`. */
  abstract findByIds(ids: string[]): Promise<Citation[]>;
  /** Returns chunks mentioning the entities, those of earlier names first. */
  abstract findMentioning(names: string[], limit: number): Promise<Citation[]>;
}
