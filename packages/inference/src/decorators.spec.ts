import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ChatModel, type ChatRequest } from './chat-model.js';
import { DimensionCheckingEmbedder } from './dimension-checking-embedder.js';
import { Embedder } from './embedder.js';
import {
  EmbeddingDimensionError,
  InvalidModelOutputError,
  ModelRequestError,
  ModelUnavailableError,
} from './errors.js';
import { toInferenceConfig, inferenceEnvSchema } from './inference.config.js';
import { RetryingChatModel } from './retrying-chat-model.js';
import { RetryingEmbedder } from './retrying-embedder.js';
import { parseStructuredOutput } from './structured-output.js';
import { estimateTokens } from './token-estimate.js';

const POLICY = { maxAttempts: 3, baseDelayMs: 0 };
const REQUEST: ChatRequest = { messages: [] };

class FlakyChatModel extends ChatModel {
  calls = 0;

  constructor(private readonly failures: Error[]) {
    super();
  }

  private attempt(): void {
    const failure = this.failures[this.calls];
    this.calls += 1;
    if (failure) {
      throw failure;
    }
  }

  async complete(): Promise<string> {
    this.attempt();
    return 'done';
  }

  async completeStructured<T>(_request: ChatRequest, schema: z.ZodType<T>): Promise<T> {
    this.attempt();
    return schema.parse({ ok: true });
  }

  async *stream(): AsyncIterable<string> {
    this.attempt();
    yield 'first';
    const late = this.failures[this.calls];
    if (late) {
      this.calls += 1;
      throw late;
    }
    yield 'second';
  }
}

async function collect(parts: AsyncIterable<string>): Promise<string[]> {
  const collected: string[] = [];
  for await (const part of parts) {
    collected.push(part);
  }
  return collected;
}

describe('RetryingChatModel', () => {
  it('retries while the provider is unavailable', async () => {
    const inner = new FlakyChatModel([
      new ModelUnavailableError('a'),
      new ModelUnavailableError('b'),
    ]);

    await expect(new RetryingChatModel(inner, POLICY).complete(REQUEST)).resolves.toBe('done');
    expect(inner.calls).toBe(3);
  });

  it('retries invalid output', async () => {
    const inner = new FlakyChatModel([new InvalidModelOutputError('a')]);
    const schema = z.object({ ok: z.boolean() });

    await expect(
      new RetryingChatModel(inner, POLICY).completeStructured(REQUEST, schema),
    ).resolves.toEqual({ ok: true });
    expect(inner.calls).toBe(2);
  });

  it('gives up after the last attempt with the last error', async () => {
    const inner = new FlakyChatModel([
      new ModelUnavailableError('a'),
      new ModelUnavailableError('b'),
      new ModelUnavailableError('c'),
    ]);

    await expect(new RetryingChatModel(inner, POLICY).complete(REQUEST)).rejects.toThrow('c');
    expect(inner.calls).toBe(3);
  });

  it('does not retry a rejected request', async () => {
    const inner = new FlakyChatModel([new ModelRequestError('bad key')]);

    await expect(new RetryingChatModel(inner, POLICY).complete(REQUEST)).rejects.toThrow('bad key');
    expect(inner.calls).toBe(1);
  });

  it('retries a stream that fails before its first token', async () => {
    const inner = new FlakyChatModel([new ModelUnavailableError('a')]);

    await expect(collect(new RetryingChatModel(inner, POLICY).stream(REQUEST))).resolves.toEqual([
      'first',
      'second',
    ]);
    expect(inner.calls).toBe(2);
  });

  it('does not repeat tokens when a stream fails later', async () => {
    const inner = new FlakyChatModel([]);
    inner.stream = async function* () {
      yield 'first';
      throw new ModelUnavailableError('dropped');
    };
    const seen: string[] = [];

    await expect(
      (async () => {
        for await (const part of new RetryingChatModel(inner, POLICY).stream(REQUEST)) {
          seen.push(part);
        }
      })(),
    ).rejects.toThrow('dropped');
    expect(seen).toEqual(['first']);
  });

  it('handles an empty stream', async () => {
    const inner = new FlakyChatModel([]);
    inner.stream = async function* () {
      // Nothing to yield.
    };

    await expect(collect(new RetryingChatModel(inner, POLICY).stream(REQUEST))).resolves.toEqual(
      [],
    );
  });

  it('closes the provider stream when the caller stops reading', async () => {
    const inner = new FlakyChatModel([]);
    let closed = false;
    inner.stream = async function* () {
      try {
        yield 'first';
        yield 'second';
      } finally {
        closed = true;
      }
    };

    for await (const part of new RetryingChatModel(inner, POLICY).stream(REQUEST)) {
      expect(part).toBe('first');
      break;
    }

    expect(closed).toBe(true);
  });
});

class StubEmbedder extends Embedder {
  calls = 0;

  constructor(
    private readonly vector: number[],
    private readonly failures: Error[] = [],
  ) {
    super();
  }

  private attempt(): void {
    const failure = this.failures[this.calls];
    this.calls += 1;
    if (failure) {
      throw failure;
    }
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    this.attempt();
    return texts.map(() => this.vector);
  }

  async embedQuery(): Promise<number[]> {
    this.attempt();
    return this.vector;
  }
}

describe('RetryingEmbedder', () => {
  it('retries both kinds of calls', async () => {
    const inner = new StubEmbedder([1], [new ModelUnavailableError('a')]);
    const embedder = new RetryingEmbedder(inner, POLICY);

    await expect(embedder.embedQuery('q')).resolves.toEqual([1]);
    await expect(embedder.embedDocuments(['x'])).resolves.toEqual([[1]]);
    expect(inner.calls).toBe(3);
  });
});

describe('DimensionCheckingEmbedder', () => {
  it('passes vectors of the configured size', async () => {
    const embedder = new DimensionCheckingEmbedder(new StubEmbedder([1, 2]), 2);

    await expect(embedder.embedQuery('q')).resolves.toEqual([1, 2]);
    await expect(embedder.embedDocuments(['x'])).resolves.toEqual([[1, 2]]);
  });

  it('rejects other sizes, which the vector index would silently skip', async () => {
    const embedder = new DimensionCheckingEmbedder(new StubEmbedder([1, 2, 3]), 2);

    await expect(embedder.embedQuery('q')).rejects.toThrow(EmbeddingDimensionError);
    await expect(embedder.embedDocuments(['x'])).rejects.toThrow(EmbeddingDimensionError);
  });
});

describe('parseStructuredOutput', () => {
  const schema = z.object({ answer: z.string() });

  it('parses plain JSON', () => {
    expect(parseStructuredOutput('{"answer":"a"}', schema)).toEqual({ answer: 'a' });
  });

  it('cuts through prose and code fences', () => {
    const raw = 'Here you go:\n```json\n{"answer":"a"}\n```\nDone.';

    expect(parseStructuredOutput(raw, schema)).toEqual({ answer: 'a' });
  });

  it.each(['no json here', '{"answer":', '{"answer":1}', '{not json}', ''])('rejects %j', (raw) => {
    expect(() => parseStructuredOutput(raw, schema)).toThrow(InvalidModelOutputError);
  });
});

describe('estimateTokens', () => {
  it('rounds up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('toInferenceConfig', () => {
  const env = {
    CHAT_PROVIDER: 'openai-compatible',
    CHAT_BASE_URL: 'https://openrouter.ai/api/v1',
    CHAT_API_KEY: 'secret',
    CHAT_MODEL: 'some/model',
    EMBEDDING_PROVIDER: 'ollama',
    EMBEDDING_BASE_URL: 'http://localhost:11434',
    EMBEDDING_MODEL: 'embedding',
    EMBEDDING_DIMENSION: '1024',
  };

  it('configures chat and embeddings apart, with defaults', () => {
    const config = toInferenceConfig(inferenceEnvSchema.parse(env));

    expect(config.chat).toMatchObject({ provider: 'openai-compatible', contextWindow: 8192 });
    expect(config.embedding).toMatchObject({
      provider: 'ollama',
      dimension: 1024,
      apiKey: 'not-set',
    });
    expect(config.retry).toEqual({ maxAttempts: 3, baseDelayMs: 2000 });
  });

  it('rejects a provider without an adapter', () => {
    expect(inferenceEnvSchema.safeParse({ ...env, CHAT_PROVIDER: 'other' }).success).toBe(false);
  });
});
