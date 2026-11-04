import { Embedder } from './embedder.js';
import { EmbeddingDimensionError } from './errors.js';

/** Neo4j leaves a vector of the wrong size out of the index without any error, so check here. */
export class DimensionCheckingEmbedder extends Embedder {
  constructor(
    private readonly inner: Embedder,
    private readonly dimension: number,
  ) {
    super();
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const vectors = await this.inner.embedDocuments(texts);
    vectors.forEach((vector) => this.check(vector));
    return vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    const vector = await this.inner.embedQuery(text);
    this.check(vector);
    return vector;
  }

  private check(vector: number[]): void {
    if (vector.length !== this.dimension) {
      throw new EmbeddingDimensionError(
        `The embedding model returned ${vector.length} dimensions, but EMBEDDING_DIMENSION is ` +
          `${this.dimension}. Fix the setting; changing the model requires reindexing.`,
      );
    }
  }
}
