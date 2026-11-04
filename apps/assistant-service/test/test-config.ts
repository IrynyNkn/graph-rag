import type { Env } from '@graph-rag/nest-common';
import { AppConfig } from '../src/config.js';

const BASE_ENV: Env = {
  POSTGRES_URL: 'postgres://unused',
  NEO4J_URI: 'bolt://unused',
  NEO4J_USER: 'neo4j',
  NEO4J_PASSWORD: 'unused',
  CHAT_PROVIDER: 'ollama',
  CHAT_BASE_URL: 'http://localhost:1',
  CHAT_MODEL: 'fake-chat',
  EMBEDDING_PROVIDER: 'ollama',
  EMBEDDING_BASE_URL: 'http://localhost:1',
  EMBEDDING_MODEL: 'fake-embedding',
  EMBEDDING_DIMENSION: '3',
};

export function testConfig(overrides: Env = {}): AppConfig {
  return AppConfig.fromEnv({ ...BASE_ENV, ...overrides });
}
