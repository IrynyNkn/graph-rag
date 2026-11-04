import OpenAI from 'openai';
import { Embedder } from '../embedder.js';
import { ModelUnavailableError } from '../errors.js';
import type { EmbedderConfig } from '../inference.config.js';
import { toOpenAiError } from './openai-errors.js';

export class OpenAiCompatibleEmbedder extends Embedder {
  private readonly client: OpenAI;

  constructor(private readonly config: EmbedderConfig) {
    super();
    this.client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      maxRetries: 0,
    });
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts.map((text) => this.config.documentPrefix + text));
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([this.config.queryPrefix + text]);
    if (vector === undefined) {
      throw new ModelUnavailableError('The embedding provider returned no embedding');
    }
    return vector;
  }

  private async embed(input: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.config.model,
        input,
        encoding_format: 'float',
      });
      return response.data.map((item) => item.embedding);
    } catch (error) {
      throw toOpenAiError(error);
    }
  }
}
