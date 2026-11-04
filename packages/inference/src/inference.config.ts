import { z } from 'zod';
import type { RetryPolicy } from './retry.js';

const providerSchema = z.enum(['ollama', 'openai-compatible']);
export type InferenceProvider = z.infer<typeof providerSchema>;

/** Chat and embeddings are configured apart, so embeddings can stay local behind a paid chat. */
export const inferenceEnvSchema = z.object({
  CHAT_PROVIDER: providerSchema,
  CHAT_BASE_URL: z.url(),
  CHAT_API_KEY: z.string().default('not-set'),
  CHAT_MODEL: z.string().min(1),
  CHAT_CONTEXT_WINDOW: z.coerce.number().int().positive().default(8192),
  CHAT_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),
  CHAT_RETRY_BASE_DELAY_MS: z.coerce.number().int().nonnegative().default(2000),
  EMBEDDING_PROVIDER: providerSchema,
  EMBEDDING_BASE_URL: z.url(),
  EMBEDDING_API_KEY: z.string().default('not-set'),
  EMBEDDING_MODEL: z.string().min(1),
  EMBEDDING_DIMENSION: z.coerce.number().int().positive(),
  EMBEDDING_DOCUMENT_PREFIX: z.string().default(''),
  EMBEDDING_QUERY_PREFIX: z.string().default(''),
});
export type InferenceEnv = z.infer<typeof inferenceEnvSchema>;

export interface ChatModelConfig {
  provider: InferenceProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  contextWindow: number;
}

export interface EmbedderConfig {
  provider: InferenceProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  dimension: number;
  documentPrefix: string;
  queryPrefix: string;
}

export interface InferenceConfig {
  chat: ChatModelConfig;
  embedding: EmbedderConfig;
  retry: RetryPolicy;
}

export function toInferenceConfig(env: InferenceEnv): InferenceConfig {
  return {
    chat: {
      provider: env.CHAT_PROVIDER,
      baseUrl: env.CHAT_BASE_URL,
      apiKey: env.CHAT_API_KEY,
      model: env.CHAT_MODEL,
      contextWindow: env.CHAT_CONTEXT_WINDOW,
    },
    embedding: {
      provider: env.EMBEDDING_PROVIDER,
      baseUrl: env.EMBEDDING_BASE_URL,
      apiKey: env.EMBEDDING_API_KEY,
      model: env.EMBEDDING_MODEL,
      dimension: env.EMBEDDING_DIMENSION,
      documentPrefix: env.EMBEDDING_DOCUMENT_PREFIX,
      queryPrefix: env.EMBEDDING_QUERY_PREFIX,
    },
    retry: {
      maxAttempts: env.CHAT_RETRY_ATTEMPTS,
      baseDelayMs: env.CHAT_RETRY_BASE_DELAY_MS,
    },
  };
}
