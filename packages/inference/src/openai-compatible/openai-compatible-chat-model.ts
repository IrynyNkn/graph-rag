import OpenAI from 'openai';
import type { ChatRequest } from '../chat-model.js';
import type { ChatModelConfig } from '../inference.config.js';
import { StreamingChatModel } from '../streaming-chat-model.js';
import type { JsonSchema } from '../structured-output.js';
import { toOpenAiError } from './openai-errors.js';

/** Works with any OpenAI-compatible API: OpenRouter, ChatGPT, LM Studio. */
export class OpenAiCompatibleChatModel extends StreamingChatModel {
  private readonly client: OpenAI;

  constructor(private readonly config: ChatModelConfig) {
    super();
    this.client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      // RetryingChatModel owns retries.
      maxRetries: 0,
    });
  }

  protected async *generate(request: ChatRequest, jsonSchema?: JsonSchema): AsyncIterable<string> {
    try {
      const parts = await this.client.chat.completions.create({
        model: this.config.model,
        messages: request.messages,
        stream: true,
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        response_format: jsonSchema && {
          type: 'json_schema',
          json_schema: { name: 'response', schema: jsonSchema, strict: true },
        },
      });
      for await (const part of parts) {
        const text = part.choices[0]?.delta.content;
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      throw toOpenAiError(error);
    }
  }
}
