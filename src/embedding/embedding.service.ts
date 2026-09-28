import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddingService {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('ollama.baseUrl');
    this.model = config.getOrThrow<string>('embedding.model');
  }

  get modelName(): string {
    return this.model;
  }

  async embedDocument(text: string): Promise<number[]> {
    return this.embed(`search_document: ${text}`);
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embed(`search_query: ${text}`);
  }

  /**
   * nomic-embed-text is trained with task-instruction prefixes and is
   * documented to need them: without "search_query: " / "search_document: ".
   * A different embedding model may use a different convention (or
   * none) — this prefixing is specific to the model named in
   * `embedding.model` and must be revisited if that config changes.
   */
  private async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: text }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama embed request failed (${res.status}): ${body}`);
    }

    // /api/embed is batch-shaped (`input` may be an array), so the response
    // is always `embeddings: number[][]` even for single-string input.
    const data = (await res.json()) as { embeddings?: number[][] };
    const vector = data.embeddings?.[0];
    if (!Array.isArray(vector)) {
      throw new Error('Ollama embed response missing "embeddings[0]"');
    }
    return vector;
  }
}
