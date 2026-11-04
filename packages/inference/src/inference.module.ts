import { Module, type DynamicModule } from '@nestjs/common';
import { ChatModel } from './chat-model.js';
import { DimensionCheckingEmbedder } from './dimension-checking-embedder.js';
import { Embedder } from './embedder.js';
import type {
  ChatModelConfig,
  EmbedderConfig,
  InferenceConfig,
  InferenceProvider,
} from './inference.config.js';
import { OllamaChatModel } from './ollama/ollama-chat-model.js';
import { OllamaEmbedder } from './ollama/ollama-embedder.js';
import { OpenAiCompatibleChatModel } from './openai-compatible/openai-compatible-chat-model.js';
import { OpenAiCompatibleEmbedder } from './openai-compatible/openai-compatible-embedder.js';
import { RetryingChatModel } from './retrying-chat-model.js';
import { RetryingEmbedder } from './retrying-embedder.js';

const CHAT_MODELS: Record<InferenceProvider, (config: ChatModelConfig) => ChatModel> = {
  ollama: (config) => new OllamaChatModel(config),
  'openai-compatible': (config) => new OpenAiCompatibleChatModel(config),
};

const EMBEDDERS: Record<InferenceProvider, (config: EmbedderConfig) => Embedder> = {
  ollama: (config) => new OllamaEmbedder(config),
  'openai-compatible': (config) => new OpenAiCompatibleEmbedder(config),
};

@Module({})
export class InferenceModule {
  static forRoot(config: InferenceConfig): DynamicModule {
    return {
      module: InferenceModule,
      providers: [
        { provide: ChatModel, useFactory: () => createChatModel(config) },
        { provide: Embedder, useFactory: () => createEmbedder(config) },
      ],
      exports: [ChatModel, Embedder],
    };
  }
}

function createChatModel(config: InferenceConfig): ChatModel {
  return new RetryingChatModel(CHAT_MODELS[config.chat.provider](config.chat), config.retry);
}

function createEmbedder(config: InferenceConfig): Embedder {
  const adapter = EMBEDDERS[config.embedding.provider](config.embedding);
  return new DimensionCheckingEmbedder(
    new RetryingEmbedder(adapter, config.retry),
    config.embedding.dimension,
  );
}
