import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ChatModel } from './chat-model.js';
import { DimensionCheckingEmbedder } from './dimension-checking-embedder.js';
import { Embedder } from './embedder.js';
import type { InferenceConfig, InferenceProvider } from './inference.config.js';
import { InferenceModule } from './inference.module.js';
import { RetryingChatModel } from './retrying-chat-model.js';

function configFor(provider: InferenceProvider): InferenceConfig {
  return {
    chat: {
      provider,
      baseUrl: 'http://localhost:1',
      apiKey: 'key',
      model: 'chat',
      contextWindow: 8192,
    },
    embedding: {
      provider,
      baseUrl: 'http://localhost:1',
      apiKey: 'key',
      model: 'embedding',
      dimension: 3,
      documentPrefix: '',
      queryPrefix: '',
    },
    retry: { maxAttempts: 1, baseDelayMs: 0 },
  };
}

describe('InferenceModule', () => {
  it.each(['ollama', 'openai-compatible'] as const)(
    'wires the %s adapters behind the ports',
    async (provider) => {
      const moduleRef = await Test.createTestingModule({
        imports: [InferenceModule.forRoot(configFor(provider))],
      }).compile();

      expect(moduleRef.get(ChatModel)).toBeInstanceOf(RetryingChatModel);
      expect(moduleRef.get(Embedder)).toBeInstanceOf(DimensionCheckingEmbedder);
    },
  );
});
