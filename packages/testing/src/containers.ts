import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

const STARTUP_TIMEOUT_MS = 180_000;
const NEO4J_PASSWORD = 'integration-tests';
const POSTGRES_PASSWORD = 'integration-tests';

export interface Neo4jConnection {
  uri: string;
  user: string;
  password: string;
}

export interface TestStores {
  neo4j: Neo4jConnection;
  postgresUrl: string;
  rabbitMqUrl: string;
}

export interface StartedTestStores {
  stores: TestStores;
  stop(): Promise<void>;
}

/** Starts the real stores, shared by a whole integration run because Neo4j starts slowly. */
export async function startTestStores(): Promise<StartedTestStores> {
  const [neo4j, postgres, rabbitMq] = await Promise.all([
    startNeo4j(),
    startPostgres(),
    startRabbitMq(),
  ]);
  return {
    stores: {
      neo4j: {
        uri: `bolt://${neo4j.getHost()}:${neo4j.getMappedPort(7687)}`,
        user: 'neo4j',
        password: NEO4J_PASSWORD,
      },
      postgresUrl: `postgres://postgres:${POSTGRES_PASSWORD}@${postgres.getHost()}:${postgres.getMappedPort(5432)}/postgres`,
      rabbitMqUrl: `amqp://${rabbitMq.getHost()}:${rabbitMq.getMappedPort(5672)}`,
    },
    stop: async () => {
      await Promise.all([neo4j.stop(), postgres.stop(), rabbitMq.stop()]);
    },
  };
}

function startNeo4j(): Promise<StartedTestContainer> {
  return new GenericContainer('neo4j:5-community')
    .withEnvironment({
      NEO4J_AUTH: `neo4j/${NEO4J_PASSWORD}`,
      NEO4J_PLUGINS: '["apoc"]',
      NEO4J_server_memory_heap_max__size: '1G',
      NEO4J_server_memory_pagecache_size: '256M',
    })
    .withExposedPorts(7687)
    .withWaitStrategy(Wait.forLogMessage(/Bolt enabled on/))
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();
}

function startPostgres(): Promise<StartedTestContainer> {
  return new GenericContainer('postgres:17-alpine')
    .withEnvironment({ POSTGRES_PASSWORD })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();
}

function startRabbitMq(): Promise<StartedTestContainer> {
  return new GenericContainer('rabbitmq:4-alpine')
    .withExposedPorts(5672)
    .withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();
}
