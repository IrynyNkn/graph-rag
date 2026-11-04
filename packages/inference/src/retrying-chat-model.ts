import type { ZodType } from 'zod';
import { ChatModel, type ChatRequest } from './chat-model.js';
import { withRetries, type RetryPolicy } from './retry.js';

export class RetryingChatModel extends ChatModel {
  constructor(
    private readonly inner: ChatModel,
    private readonly policy: RetryPolicy,
  ) {
    super();
  }

  complete(request: ChatRequest): Promise<string> {
    return withRetries(() => this.inner.complete(request), this.policy);
  }

  completeStructured<T>(request: ChatRequest, schema: ZodType<T>): Promise<T> {
    return withRetries(() => this.inner.completeStructured(request, schema), this.policy);
  }

  /** Once a token has reached the caller a retry would repeat it, so only the start is retried. */
  async *stream(request: ChatRequest): AsyncIterable<string> {
    const { parts, first } = await withRetries(() => this.openStream(request), this.policy);
    try {
      for (let next = first; !next.done; next = await parts.next()) {
        yield next.value;
      }
    } finally {
      await parts.return?.();
    }
  }

  private async openStream(request: ChatRequest) {
    const parts = this.inner.stream(request)[Symbol.asyncIterator]();
    return { parts, first: await parts.next() };
  }
}
