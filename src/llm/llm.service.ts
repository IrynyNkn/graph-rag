import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GenerateOptions {
  /** Ask Ollama to constrain output to valid JSON (`format: 'json'`). */
  json?: boolean;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('ollama.baseUrl');
    this.model = config.getOrThrow<string>('ollama.model');
  }

  async generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        ...(options.json ? { format: 'json' } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama request failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { response?: string };
    if (typeof data.response !== 'string') {
      throw new Error('Ollama response missing "response" field');
    }
    return data.response;
  }
}
