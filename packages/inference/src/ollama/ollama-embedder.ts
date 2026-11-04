import { Ollama } from 'ollama';
import { Embedder } from '../embedder.js';
import { ModelUnavailableError } from '../errors.js';
import type { EmbedderConfig } from '../inference.config.js';
import { toOllamaError } from './ollama-errors.js';

export class OllamaEmbedder extends Embedder {
  private readonly client: Ollama;

  constructor(private readonly config: EmbedderConfig) {
    super();
    this.client = new Ollama({ host: config.baseUrl });
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts.map((text) => this.config.documentPrefix + text));
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([this.config.queryPrefix + text]);
    if (vector === undefined) {
      throw new ModelUnavailableError('Ollama returned no embedding');
    }
    return vector;
  }

  private async embed(input: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embed({ model: this.config.model, input });
      return response.embeddings;
    } catch (error) {
      throw toOllamaError(error);
    }
  }
}
