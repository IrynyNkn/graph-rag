import { fileURLToPath } from 'node:url';
import { Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as tables from './tables.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));
// Any constant works, as long as every service takes the same lock.
const MIGRATION_LOCK_ID = 727_001;

export type RelationalDatabase = NodePgDatabase<typeof tables>;

export interface RelationalStoreOptions {
  connectionString: string;
}

export class RelationalStore implements OnModuleInit, OnApplicationShutdown {
  readonly db: RelationalDatabase;
  private readonly logger = new Logger(RelationalStore.name);
  private readonly pool: Pool;

  constructor(options: RelationalStoreOptions) {
    this.pool = new Pool({ connectionString: options.connectionString });
    this.pool.on('error', (error) => this.logger.error(`Idle connection failed: ${error}`));
    this.db = drizzle(this.pool, { schema: tables });
  }

  /** Services start at the same time, so the lock keeps migrations from running in parallel. */
  async onModuleInit(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
      client.release();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
