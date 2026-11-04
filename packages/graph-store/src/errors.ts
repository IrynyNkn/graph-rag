/** Thrown at startup: the existing index would silently skip vectors of the configured size. */
export class VectorIndexDimensionError extends Error {
  constructor(indexed: unknown, configured: number) {
    super(
      `The vector index was created with ${String(indexed)} dimensions, but EMBEDDING_DIMENSION ` +
        `is ${configured}. Changing the embedding model requires reindexing: drop the Neo4j ` +
        `volume or the index, then upload the documents again.`,
    );
    this.name = 'VectorIndexDimensionError';
  }
}
