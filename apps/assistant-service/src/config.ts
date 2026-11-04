import { inferenceEnvSchema, toInferenceConfig, type InferenceConfig } from '@graph-rag/inference';
import { parseEnv, type Env } from '@graph-rag/nest-common';
import { z } from 'zod';

// Room for the instructions and the question.
const PROMPT_MARGIN_TOKENS = 400;

const positiveInt = () => z.coerce.number().int().positive();

const envSchema = inferenceEnvSchema
  .extend({
    PORT: positiveInt().default(3002),
    POSTGRES_URL: z.string().min(1),
    NEO4J_URI: z.string().min(1),
    NEO4J_USER: z.string().min(1),
    NEO4J_PASSWORD: z.string().min(1),
    HISTORY_MAX_TOKENS: positiveInt().default(1000),
    HISTORY_RECENT_TOKENS: positiveInt().default(500),
    SUMMARY_MAX_OUTPUT_TOKENS: positiveInt().default(300),
    ANALYSIS_MAX_OUTPUT_TOKENS: positiveInt().default(200),
    QUERY_ENTITIES_MAX_OUTPUT_TOKENS: positiveInt().default(200),
    ANSWER_MAX_OUTPUT_TOKENS: positiveInt().default(1000),
    ANSWER_TEMPERATURE: z.coerce.number().nonnegative().default(0.2),
    CONTEXT_PATHS_TOKENS: positiveInt().default(800),
    CONTEXT_DESCRIPTIONS_TOKENS: positiveInt().default(800),
    CONTEXT_CHUNKS_TOKENS: positiveInt().default(1400),
    CONTEXT_MAX_CHUNKS: positiveInt().default(5),
    QASA_MAX_STEPS: positiveInt().default(3),
    QASA_DECAY: z.coerce.number().positive().default(0.7),
    QASA_THRESHOLD: z.coerce.number().nonnegative().default(0.01),
    QASA_TOP_PATHS: positiveInt().default(30),
    QASA_TOP_ENTITIES: positiveInt().default(30),
    QASA_SEEDS_PER_ENTITY: positiveInt().default(5),
  })
  .refine(
    (env) =>
      env.HISTORY_MAX_TOKENS +
        env.CONTEXT_PATHS_TOKENS +
        env.CONTEXT_DESCRIPTIONS_TOKENS +
        env.CONTEXT_CHUNKS_TOKENS +
        env.ANSWER_MAX_OUTPUT_TOKENS +
        PROMPT_MARGIN_TOKENS <=
      env.CHAT_CONTEXT_WINDOW,
    { message: 'History, context and answer budgets do not fit into CHAT_CONTEXT_WINDOW' },
  )
  .refine((env) => env.HISTORY_RECENT_TOKENS < env.HISTORY_MAX_TOKENS, {
    message: 'HISTORY_RECENT_TOKENS must be smaller than HISTORY_MAX_TOKENS',
  });

export class AppConfig {
  readonly port: number;
  readonly postgresUrl: string;
  readonly neo4j: { uri: string; user: string; password: string };
  readonly inference: InferenceConfig;
  readonly history: { maxTokens: number; recentTokens: number; summaryMaxOutputTokens: number };
  readonly analysis: { maxOutputTokens: number };
  readonly answer: { maxOutputTokens: number; temperature: number };
  readonly context: {
    pathsTokens: number;
    descriptionsTokens: number;
    chunksTokens: number;
    maxChunks: number;
  };
  readonly qasa: {
    maxSteps: number;
    decay: number;
    threshold: number;
    topPaths: number;
    topEntities: number;
    seedsPerEntity: number;
    queryEntitiesMaxOutputTokens: number;
  };

  private constructor(env: z.infer<typeof envSchema>) {
    this.port = env.PORT;
    this.postgresUrl = env.POSTGRES_URL;
    this.neo4j = { uri: env.NEO4J_URI, user: env.NEO4J_USER, password: env.NEO4J_PASSWORD };
    this.inference = toInferenceConfig(env);
    this.history = {
      maxTokens: env.HISTORY_MAX_TOKENS,
      recentTokens: env.HISTORY_RECENT_TOKENS,
      summaryMaxOutputTokens: env.SUMMARY_MAX_OUTPUT_TOKENS,
    };
    this.analysis = { maxOutputTokens: env.ANALYSIS_MAX_OUTPUT_TOKENS };
    this.answer = {
      maxOutputTokens: env.ANSWER_MAX_OUTPUT_TOKENS,
      temperature: env.ANSWER_TEMPERATURE,
    };
    this.context = {
      pathsTokens: env.CONTEXT_PATHS_TOKENS,
      descriptionsTokens: env.CONTEXT_DESCRIPTIONS_TOKENS,
      chunksTokens: env.CONTEXT_CHUNKS_TOKENS,
      maxChunks: env.CONTEXT_MAX_CHUNKS,
    };
    this.qasa = {
      maxSteps: env.QASA_MAX_STEPS,
      decay: env.QASA_DECAY,
      threshold: env.QASA_THRESHOLD,
      topPaths: env.QASA_TOP_PATHS,
      topEntities: env.QASA_TOP_ENTITIES,
      seedsPerEntity: env.QASA_SEEDS_PER_ENTITY,
      queryEntitiesMaxOutputTokens: env.QUERY_ENTITIES_MAX_OUTPUT_TOKENS,
    };
  }

  static fromEnv(env: Env): AppConfig {
    return new AppConfig(parseEnv(envSchema, env));
  }
}
