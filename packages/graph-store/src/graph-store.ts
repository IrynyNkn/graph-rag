import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import neo4j, { Neo4jError, routing, type Driver, type ManagedTransaction } from 'neo4j-driver';
import { VectorIndexDimensionError } from './errors.js';
import { AWAIT_INDEXES, FIND_VECTOR_INDEX_DIMENSION, schemaStatements } from './graph-schema.js';

export interface GraphStoreOptions {
  uri: string;
  user: string;
  password: string;
  embeddingDimension: number;
}

export type GraphParameters = Record<string, unknown>;
export type GraphRow = Record<string, unknown>;

export interface GraphTransaction {
  run(query: string, parameters?: GraphParameters): Promise<GraphRow[]>;
}

/** The connection and the schema. Cypher itself lives in each service's repositories. */
export class GraphStore implements OnModuleInit, OnApplicationShutdown {
  private readonly driver: Driver;

  constructor(private readonly options: GraphStoreOptions) {
    this.driver = neo4j.driver(options.uri, neo4j.auth.basic(options.user, options.password), {
      disableLosslessIntegers: true,
    });
  }

  async onModuleInit(): Promise<void> {
    for (const statement of schemaStatements(this.options.embeddingDimension)) {
      await this.write(statement);
    }
    await this.checkVectorDimension();
    await this.read(AWAIT_INDEXES);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.driver.close();
  }

  async read(query: string, parameters: GraphParameters = {}): Promise<GraphRow[]> {
    const { records } = await this.driver.executeQuery(query, parameters, {
      routing: routing.READ,
    });
    return records.map((record) => record.toObject());
  }

  async write(query: string, parameters: GraphParameters = {}): Promise<GraphRow[]> {
    const { records } = await this.driver.executeQuery(query, parameters, {
      routing: routing.WRITE,
    });
    return records.map((record) => record.toObject());
  }

  /** Runs `work` in one transaction. The driver retries it on deadlocks and transient errors. */
  async transaction<T>(work: (transaction: GraphTransaction) => Promise<T>): Promise<T> {
    const session = this.driver.session();
    try {
      return await session.executeWrite((transaction) => work(wrap(transaction)));
    } finally {
      await session.close();
    }
  }

  private async checkVectorDimension(): Promise<void> {
    const [index] = await this.read(FIND_VECTOR_INDEX_DIMENSION);
    const dimension = index?.['dimension'];
    if (dimension !== this.options.embeddingDimension) {
      throw new VectorIndexDimensionError(dimension, this.options.embeddingDimension);
    }
  }
}

function wrap(transaction: ManagedTransaction): GraphTransaction {
  return {
    run: async (query, parameters = {}) => {
      const { records } = await transaction.run(query, parameters);
      return records.map((record) => record.toObject());
    },
  };
}

/** Plain numbers reach Cypher as floats, and LIMIT, k and stored ordinals need integers. */
export function graphInt(value: number): unknown {
  return neo4j.int(value);
}

/** True when a plain DELETE failed because the node gained a relationship in the meantime. */
export function isConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Neo4jError &&
    error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed'
  );
}
