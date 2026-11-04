import { inferenceEnvSchema, toInferenceConfig, type InferenceConfig } from '@graph-rag/inference';
import { parseEnv, type Env } from '@graph-rag/nest-common';
import { z } from 'zod';

const CHARS_PER_TOKEN = 4;
// Room for the extraction instructions, the document title and the heading path.
const PROMPT_MARGIN_TOKENS = 500;

const positiveInt = () => z.coerce.number().int().positive();

const envSchema = inferenceEnvSchema
  .extend({
    POSTGRES_URL: z.string().min(1),
    RABBITMQ_URL: z.string().min(1),
    NEO4J_URI: z.string().min(1),
    NEO4J_USER: z.string().min(1),
    NEO4J_PASSWORD: z.string().min(1),
    FILE_STORE_DIRECTORY: z.string().min(1),
    CHUNK_MAX_CHARS: positiveInt().default(1500),
    CHUNK_OVERLAP_CHARS: z.coerce.number().int().nonnegative().default(150),
    CHUNK_CONCURRENCY: positiveInt().default(1),
    EXTRACTION_MAX_OUTPUT_TOKENS: positiveInt().default(2500),
    RESOLUTION_MAX_CANDIDATES: positiveInt().default(3),
    RESOLUTION_MAX_OUTPUT_TOKENS: positiveInt().default(120),
    REFRESH_BATCH_SIZE: positiveInt().default(32),
    DESCRIPTION_MAX_CHARS: positiveInt().default(1000),
  })
  .refine(
    (env) =>
      env.CHUNK_MAX_CHARS / CHARS_PER_TOKEN +
        env.EXTRACTION_MAX_OUTPUT_TOKENS +
        PROMPT_MARGIN_TOKENS <=
      env.CHAT_CONTEXT_WINDOW,
    {
      message:
        'CHUNK_MAX_CHARS and EXTRACTION_MAX_OUTPUT_TOKENS do not fit into CHAT_CONTEXT_WINDOW',
    },
  )
  .refine((env) => env.CHUNK_OVERLAP_CHARS < env.CHUNK_MAX_CHARS, {
    message: 'CHUNK_OVERLAP_CHARS must be smaller than CHUNK_MAX_CHARS',
  });

export class AppConfig {
  readonly postgresUrl: string;
  readonly rabbitMqUrl: string;
  readonly fileStoreDirectory: string;
  readonly neo4j: { uri: string; user: string; password: string };
  readonly inference: InferenceConfig;
  readonly chunking: { maxChars: number; overlapChars: number; concurrency: number };
  readonly extraction: { maxOutputTokens: number };
  readonly resolution: { maxCandidates: number; maxOutputTokens: number };
  readonly refresh: { batchSize: number; descriptionMaxChars: number };

  private constructor(env: z.infer<typeof envSchema>) {
    this.postgresUrl = env.POSTGRES_URL;
    this.rabbitMqUrl = env.RABBITMQ_URL;
    this.fileStoreDirectory = env.FILE_STORE_DIRECTORY;
    this.neo4j = { uri: env.NEO4J_URI, user: env.NEO4J_USER, password: env.NEO4J_PASSWORD };
    this.inference = toInferenceConfig(env);
    this.chunking = {
      maxChars: env.CHUNK_MAX_CHARS,
      overlapChars: env.CHUNK_OVERLAP_CHARS,
      concurrency: env.CHUNK_CONCURRENCY,
    };
    this.extraction = { maxOutputTokens: env.EXTRACTION_MAX_OUTPUT_TOKENS };
    this.resolution = {
      maxCandidates: env.RESOLUTION_MAX_CANDIDATES,
      maxOutputTokens: env.RESOLUTION_MAX_OUTPUT_TOKENS,
    };
    this.refresh = {
      batchSize: env.REFRESH_BATCH_SIZE,
      descriptionMaxChars: env.DESCRIPTION_MAX_CHARS,
    };
  }

  static fromEnv(env: Env): AppConfig {
    return new AppConfig(parseEnv(envSchema, env));
  }
}
