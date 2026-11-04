export interface StaleEntity {
  name: string;
  revision: number;
  description: string | null;
  hasEmbedding: boolean;
  mentions: string[];
}

export interface RefreshedEntity {
  name: string;
  /** The revision this refresh was computed from. A newer one leaves the entity stale. */
  revision: number;
  description: string;
  /** Null when the description did not change, which keeps the current embedding. */
  embedding: number[] | null;
}

export abstract class KnowledgeRepository {
  /** Deletes entities that lost their last mention, without touching any that gained a new one. */
  abstract deleteOrphans(): Promise<void>;
  abstract findStale(limit: number): Promise<StaleEntity[]>;
  abstract saveRefreshed(entities: RefreshedEntity[]): Promise<void>;
}
