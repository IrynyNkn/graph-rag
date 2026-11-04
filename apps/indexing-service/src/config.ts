import { parseEnv, type Env } from '@graph-rag/nest-common';
import { z } from 'zod';

const MEGABYTE = 1024 * 1024;

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  POSTGRES_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  FILE_STORE_DIRECTORY: z.string().min(1),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * MEGABYTE),
});

export class AppConfig {
  readonly port: number;
  readonly postgresUrl: string;
  readonly rabbitMqUrl: string;
  readonly fileStoreDirectory: string;
  readonly maxUploadBytes: number;

  private constructor(env: z.infer<typeof envSchema>) {
    this.port = env.PORT;
    this.postgresUrl = env.POSTGRES_URL;
    this.rabbitMqUrl = env.RABBITMQ_URL;
    this.fileStoreDirectory = env.FILE_STORE_DIRECTORY;
    this.maxUploadBytes = env.MAX_UPLOAD_BYTES;
  }

  static fromEnv(env: Env): AppConfig {
    return new AppConfig(parseEnv(envSchema, env));
  }
}
