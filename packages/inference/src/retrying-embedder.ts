import { Embedder } from './embedder.js';
import { withRetries, type RetryPolicy } from './retry.js';

export class RetryingEmbedder extends Embedder {
  constructor(
    private readonly inner: Embedder,
    private readonly policy: RetryPolicy,
  ) {
    super();
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return withRetries(() => this.inner.embedDocuments(texts), this.policy);
  }

  embedQuery(text: string): Promise<number[]> {
    return withRetries(() => this.inner.embedQuery(text), this.policy);
  }
}
