import { Ollama } from 'ollama';
import type { ChatRequest } from '../chat-model.js';
import type { ChatModelConfig } from '../inference.config.js';
import { StreamingChatModel } from '../streaming-chat-model.js';
import type { JsonSchema } from '../structured-output.js';
import { toOllamaError } from './ollama-errors.js';

export class OllamaChatModel extends StreamingChatModel {
  private readonly client: Ollama;

  constructor(private readonly config: ChatModelConfig) {
    super();
    this.client = new Ollama({ host: config.baseUrl });
  }

  protected async *generate(request: ChatRequest, jsonSchema?: JsonSchema): AsyncIterable<string> {
    let isDone = false;
    try {
      const parts = await this.client.chat({
        model: this.config.model,
        messages: request.messages,
        stream: true,
        think: false,
        format: jsonSchema,
        options: {
          // Ollama's default is 4096, and it silently truncates anything longer.
          num_ctx: this.config.contextWindow,
          temperature: request.temperature,
          num_predict: request.maxOutputTokens,
        },
      });
      try {
        for await (const part of parts) {
          yield part.message.content;
        }
        isDone = true;
      } finally {
        // The client keeps the request open when reading stops early, and Ollama would go on
        // generating for nobody, holding the GPU.
        if (!isDone) {
          parts.abort();
        }
      }
    } catch (error) {
      throw toOllamaError(error);
    }
  }
}
