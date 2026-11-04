import type { ZodType } from 'zod';
import { ChatModel, type ChatRequest } from './chat-model.js';
import { collectText } from './collect-text.js';
import { parseStructuredOutput, toJsonSchema, type JsonSchema } from './structured-output.js';

/**
 * Adapters only implement `generate`. Everything streams, even when the caller wants the whole
 * text: a slow local model would otherwise hit fetch's five-minute wait for response headers.
 */
export abstract class StreamingChatModel extends ChatModel {
  complete(request: ChatRequest): Promise<string> {
    return collectText(this.generate(request));
  }

  async completeStructured<T>(request: ChatRequest, schema: ZodType<T>): Promise<T> {
    const raw = await collectText(this.generate(request, toJsonSchema(schema)));
    return parseStructuredOutput(raw, schema);
  }

  stream(request: ChatRequest): AsyncIterable<string> {
    return this.generate(request);
  }

  protected abstract generate(request: ChatRequest, jsonSchema?: JsonSchema): AsyncIterable<string>;
}
