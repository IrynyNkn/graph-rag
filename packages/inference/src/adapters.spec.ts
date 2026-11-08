import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ChatRequest } from './chat-model.js';
import { InvalidModelOutputError, ModelRequestError, ModelUnavailableError } from './errors.js';
import type { ChatModelConfig, EmbedderConfig } from './inference.config.js';
import { OllamaChatModel } from './ollama/ollama-chat-model.js';
import { OllamaEmbedder } from './ollama/ollama-embedder.js';
import { OpenAiCompatibleChatModel } from './openai-compatible/openai-compatible-chat-model.js';
import { OpenAiCompatibleEmbedder } from './openai-compatible/openai-compatible-embedder.js';

const answerSchema = z.object({ answer: z.string() });
const request: ChatRequest = {
  messages: [{ role: 'user', content: 'Question?' }],
  temperature: 0,
  maxOutputTokens: 100,
};

type Handler = (body: unknown, response: ServerResponse) => void;

/** A real local HTTP server, so the provider SDKs run for real against a scripted reply. */
class FakeProvider {
  readonly bodies: unknown[] = [];
  readonly paths: string[] = [];
  private server: Server | null = null;

  async start(handler: Handler): Promise<string> {
    this.server = createServer((incoming, response) => {
      void this.handle(incoming, response, handler);
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (server === null) {
      return;
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    this.server = null;
  }

  private async handle(
    incoming: IncomingMessage,
    response: ServerResponse,
    handler: Handler,
  ): Promise<void> {
    let text = '';
    for await (const chunk of incoming) {
      text += String(chunk);
    }
    const body: unknown = JSON.parse(text);
    this.bodies.push(body);
    this.paths.push(incoming.url ?? '');
    handler(body, response);
  }
}

function ndjson(response: ServerResponse, parts: string[]): void {
  response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  parts.forEach((content, index) => {
    const done = index === parts.length - 1;
    response.write(`${JSON.stringify({ message: { role: 'assistant', content }, done })}\n`);
  });
  response.end();
}

function sse(response: ServerResponse, parts: string[]): void {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const content of parts) {
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  }
  response.write('data: [DONE]\n\n');
  response.end();
}

function fail(status: number): Handler {
  return (_body, response) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'failed on purpose' }));
  };
}

async function collect(parts: AsyncIterable<string>): Promise<string[]> {
  const collected: string[] = [];
  for await (const part of parts) {
    collected.push(part);
  }
  return collected;
}

describe('provider adapters', () => {
  const provider = new FakeProvider();

  afterEach(async () => {
    provider.bodies.length = 0;
    provider.paths.length = 0;
    await provider.stop();
  });

  const chatConfig = (baseUrl: string): ChatModelConfig => ({
    provider: 'ollama',
    baseUrl,
    apiKey: 'key',
    model: 'test-model',
    contextWindow: 8192,
  });

  const embedderConfig = (baseUrl: string): EmbedderConfig => ({
    provider: 'ollama',
    baseUrl,
    apiKey: 'key',
    model: 'test-embedding',
    dimension: 2,
    documentPrefix: 'doc: ',
    queryPrefix: 'query: ',
  });

  describe('OllamaChatModel', () => {
    it('streams tokens and sets the context window explicitly', async () => {
      const url = await provider.start((_body, response) => ndjson(response, ['Al', 'ice']));
      const model = new OllamaChatModel(chatConfig(url));

      await expect(collect(model.stream(request))).resolves.toEqual(['Al', 'ice']);

      expect(provider.bodies[0]).toMatchObject({
        model: 'test-model',
        stream: true,
        think: false,
        options: { num_ctx: 8192, temperature: 0, num_predict: 100 },
      });
    });

    it('stops the model when the caller stops reading', async () => {
      let closed = () => {};
      const isClosed = new Promise<void>((resolve) => (closed = resolve));
      const url = await provider.start((_body, response) => {
        response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        response.write(`${JSON.stringify({ message: { content: 'Al' }, done: false })}\n`);
        response.on('close', closed);
      });

      for await (const part of new OllamaChatModel(chatConfig(url)).stream(request)) {
        expect(part).toBe('Al');
        break;
      }

      await expect(isClosed).resolves.toBeUndefined();
    });

    it('joins the stream for a complete answer', async () => {
      const url = await provider.start((_body, response) => ndjson(response, ['Al', 'ice']));

      await expect(new OllamaChatModel(chatConfig(url)).complete(request)).resolves.toBe('Alice');
    });

    it('passes the JSON schema and validates the reply', async () => {
      const url = await provider.start((_body, response) =>
        ndjson(response, ['{"answer":', '"Alice"}']),
      );

      await expect(
        new OllamaChatModel(chatConfig(url)).completeStructured(request, answerSchema),
      ).resolves.toEqual({ answer: 'Alice' });

      const body = provider.bodies[0] as { format: Record<string, unknown> };
      expect(body.format).toMatchObject({ type: 'object', required: ['answer'] });
      expect(body.format).not.toHaveProperty('$schema');
    });

    it('reports output that breaks the schema', async () => {
      const url = await provider.start((_body, response) => ndjson(response, ['{"wrong":1}']));

      await expect(
        new OllamaChatModel(chatConfig(url)).completeStructured(request, answerSchema),
      ).rejects.toThrow(InvalidModelOutputError);
    });

    it('reports a rejected request as permanent', async () => {
      const url = await provider.start(fail(404));

      await expect(new OllamaChatModel(chatConfig(url)).complete(request)).rejects.toThrow(
        ModelRequestError,
      );
    });

    it('reports an overloaded provider as temporary', async () => {
      const url = await provider.start(fail(503));

      await expect(new OllamaChatModel(chatConfig(url)).complete(request)).rejects.toThrow(
        ModelUnavailableError,
      );
    });

    it('reports an unreachable provider as temporary', async () => {
      const model = new OllamaChatModel(chatConfig('http://127.0.0.1:1'));

      await expect(model.complete(request)).rejects.toThrow(ModelUnavailableError);
    });
  });

  describe('OllamaEmbedder', () => {
    const reply: Handler = (_body, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          embeddings: [
            [1, 2],
            [3, 4],
          ],
        }),
      );
    };

    it('embeds documents in one batch with the document prefix', async () => {
      const url = await provider.start(reply);

      await expect(
        new OllamaEmbedder(embedderConfig(url)).embedDocuments(['a', 'b']),
      ).resolves.toEqual([
        [1, 2],
        [3, 4],
      ]);

      expect(provider.bodies).toEqual([{ model: 'test-embedding', input: ['doc: a', 'doc: b'] }]);
    });

    it('embeds a query with the query prefix', async () => {
      const url = await provider.start(reply);

      await expect(new OllamaEmbedder(embedderConfig(url)).embedQuery('a')).resolves.toEqual([
        1, 2,
      ]);

      expect(provider.bodies[0]).toMatchObject({ input: ['query: a'] });
    });

    it('reports an empty reply', async () => {
      const url = await provider.start((_body, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ embeddings: [] }));
      });

      await expect(new OllamaEmbedder(embedderConfig(url)).embedQuery('a')).rejects.toThrow(
        ModelUnavailableError,
      );
    });

    it('maps errors', async () => {
      const url = await provider.start(fail(400));

      await expect(new OllamaEmbedder(embedderConfig(url)).embedQuery('a')).rejects.toThrow(
        ModelRequestError,
      );
    });
  });

  describe('OpenAiCompatibleChatModel', () => {
    it('streams tokens from the chat completions endpoint', async () => {
      const url = await provider.start((_body, response) => sse(response, ['Al', 'ice']));
      const model = new OpenAiCompatibleChatModel(chatConfig(url));

      await expect(collect(model.stream(request))).resolves.toEqual(['Al', 'ice']);

      expect(provider.paths).toEqual(['/chat/completions']);
      expect(provider.bodies[0]).toMatchObject({
        model: 'test-model',
        stream: true,
        temperature: 0,
        max_tokens: 100,
      });
      expect(provider.bodies[0]).not.toHaveProperty('response_format');
    });

    it('asks for a strict JSON schema and validates the reply', async () => {
      const url = await provider.start((_body, response) =>
        sse(response, ['```json\n{"answer":"Alice"}\n```']),
      );

      await expect(
        new OpenAiCompatibleChatModel(chatConfig(url)).completeStructured(request, answerSchema),
      ).resolves.toEqual({ answer: 'Alice' });

      expect(provider.bodies[0]).toMatchObject({
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'response', strict: true, schema: { type: 'object' } },
        },
      });
    });

    it.each([
      [401, ModelRequestError],
      [404, ModelRequestError],
      [429, ModelUnavailableError],
      [500, ModelUnavailableError],
    ])('maps status %i', async (status, errorClass) => {
      const url = await provider.start(fail(status));

      await expect(
        new OpenAiCompatibleChatModel(chatConfig(url)).complete(request),
      ).rejects.toThrow(errorClass);
    });

    it('reports an unreachable provider as temporary', async () => {
      const model = new OpenAiCompatibleChatModel(chatConfig('http://127.0.0.1:1'));

      await expect(model.complete(request)).rejects.toThrow(ModelUnavailableError);
    });
  });

  describe('OpenAiCompatibleEmbedder', () => {
    const reply: Handler = (_body, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          object: 'list',
          data: [{ embedding: [1, 2] }, { embedding: [3, 4] }],
        }),
      );
    };

    it('embeds documents with the document prefix', async () => {
      const url = await provider.start(reply);

      await expect(
        new OpenAiCompatibleEmbedder(embedderConfig(url)).embedDocuments(['a', 'b']),
      ).resolves.toEqual([
        [1, 2],
        [3, 4],
      ]);

      expect(provider.paths).toEqual(['/embeddings']);
      expect(provider.bodies[0]).toMatchObject({
        input: ['doc: a', 'doc: b'],
        encoding_format: 'float',
      });
    });

    it('embeds a query with the query prefix', async () => {
      const url = await provider.start(reply);

      await expect(
        new OpenAiCompatibleEmbedder(embedderConfig(url)).embedQuery('a'),
      ).resolves.toEqual([1, 2]);

      expect(provider.bodies[0]).toMatchObject({ input: ['query: a'] });
    });

    it('reports an empty reply', async () => {
      const url = await provider.start((_body, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: [] }));
      });

      await expect(
        new OpenAiCompatibleEmbedder(embedderConfig(url)).embedQuery('a'),
      ).rejects.toThrow(ModelUnavailableError);
    });

    it('maps errors', async () => {
      const url = await provider.start(fail(401));

      await expect(
        new OpenAiCompatibleEmbedder(embedderConfig(url)).embedQuery('a'),
      ).rejects.toThrow(ModelRequestError);
    });
  });
});
