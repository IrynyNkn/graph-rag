import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { type Driver } from 'neo4j-driver';
import type { SeedNode, Subgraph, SubgraphEdge, Triple } from './graph.types.js';

/**
 * Fixed literal, not user input — Cypher schema commands (CREATE/SHOW/DROP
 * INDEX) take the index name as a syntactic identifier, not a bound
 * parameter, so it cannot be parameterised the way the data below is.
 */
const VECTOR_INDEX_NAME = 'entity_embedding';

const SHOW_VECTOR_INDEX = `
SHOW INDEXES YIELD name, type, options
WHERE name = $indexName AND type = 'VECTOR'
RETURN options.indexConfig['vector.dimensions'] AS dimensions
`;

const CREATE_VECTOR_INDEX = `
CREATE VECTOR INDEX ${VECTOR_INDEX_NAME} IF NOT EXISTS
FOR (n:Entity) ON (n.embedding)
OPTIONS { indexConfig: {
  \`vector.dimensions\`: $dimensions,
  \`vector.similarity_function\`: 'cosine'
}}
`;

const UPSERT_EMBEDDING = `
MATCH (e:Entity { name: $name })
SET e.embedding = $embedding,
    e.embeddingText = $embeddingText,
    e.embeddingModel = $embeddingModel
`;

const FIND_SEED_NODES = `
CALL db.index.vector.queryNodes($indexName, $limit, $vector)
YIELD node, score
WHERE score >= $threshold
RETURN node.name AS name, score
`;

/**
 * Fixed, hand-written Cypher. Never built from LLM output — the data below is
 * always passed as bound parameters ($triples, $names), so there is no string
 * interpolation and no injection surface. `UNWIND` makes the query text
 * invariant regardless of how many rows come in.
 */
const UPSERT_TRIPLES = `
UNWIND $triples AS t
MERGE (s:Entity { name: t.subject })
MERGE (o:Entity { name: t.object })
MERGE (s)-[:REL { type: t.relation }]->(o)
`;

const NEIGHBOURHOOD = `
UNWIND $names AS name
MATCH (e:Entity { name: name })
MATCH (e)-[r:REL]-(:Entity)
RETURN DISTINCT startNode(r).name AS source, r.type AS relation, endNode(r).name AS target
`;

@Injectable()
export class GraphService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GraphService.name);
  private driver!: Driver;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.driver = neo4j.driver(
      this.config.getOrThrow<string>('neo4j.uri'),
      neo4j.auth.basic(
        this.config.getOrThrow<string>('neo4j.user'),
        this.config.getOrThrow<string>('neo4j.password'),
      ),
    );
    await this.ensureVectorIndex();
  }

  async onModuleDestroy(): Promise<void> {
    await this.driver?.close();
  }

  /**
   * Runs once at startup, not per-request — index creation is a schema
   * operation, not a data operation, so it doesn't belong in IngestService.
   *
   * `CREATE VECTOR INDEX IF NOT EXISTS` silently no-ops if an index with this
   * name already exists, *even with a different dimension* (verified against
   * this project's Neo4j directly: recreating with a new dimension left the
   * old one in place, no error). That's exactly the kind of quiet failure
   * this project can't afford — a stale-dimension index doesn't error, it
   * just makes search subtly wrong. So this checks first and fails loudly on
   * a mismatch instead of trusting IF NOT EXISTS to handle it.
   */
  private async ensureVectorIndex(): Promise<void> {
    const dimension = this.config.getOrThrow<number>('embedding.dimension');
    const session = this.driver.session();
    try {
      const existing = await session.executeRead((tx) =>
        tx.run(SHOW_VECTOR_INDEX, { indexName: VECTOR_INDEX_NAME }),
      );

      if (existing.records.length > 0) {
        const currentDimension = (
          existing.records[0].get('dimensions') as neo4j.Integer
        ).toNumber();
        if (currentDimension !== dimension) {
          throw new Error(
            `Vector index "${VECTOR_INDEX_NAME}" already exists with dimension ` +
              `${currentDimension}, but the configured embedding model expects ` +
              `${dimension} (see OLLAMA_EMBEDDING_MODEL / EMBEDDING_DIMENSION). ` +
              'The embedding model changed since this index was created. Refusing ' +
              'to start rather than silently degrading search: drop the index, ' +
              're-embed every node, then restart to recreate it at the new dimension.',
          );
        }
        return;
      }

      await session.executeWrite((tx) =>
        tx.run(CREATE_VECTOR_INDEX, { dimensions: neo4j.int(dimension) }),
      );
      this.logger.log(
        `Created vector index "${VECTOR_INDEX_NAME}" (dimension ${dimension}).`,
      );
    } finally {
      await session.close();
    }
  }

  async upsertTriples(triples: Triple[]): Promise<void> {
    if (triples.length === 0) return;
    const session = this.driver.session();
    try {
      await session.executeWrite((tx) => tx.run(UPSERT_TRIPLES, { triples }));
    } finally {
      await session.close();
    }
  }

  async getNeighborhood(names: string[]): Promise<Subgraph> {
    if (names.length === 0) return { nodes: [], edges: [] };

    const session = this.driver.session();
    try {
      const result = await session.executeRead((tx) =>
        tx.run(NEIGHBOURHOOD, { names }),
      );

      const edges: SubgraphEdge[] = result.records.map((r) => ({
        source: r.get('source') as string,
        relation: r.get('relation') as string,
        target: r.get('target') as string,
      }));

      const nodeNames = new Set<string>();
      for (const e of edges) {
        nodeNames.add(e.source);
        nodeNames.add(e.target);
      }

      return {
        nodes: [...nodeNames].map((name) => ({ name })),
        edges,
      };
    } finally {
      await session.close();
    }
  }

  /** `text` and `model` are stored alongside the vector (not just the vector
   *  itself) so a future embedding-model swap can be detected and re-run
   *  node by node, instead of discovering it only via degraded search. */
  async upsertEmbedding(
    name: string,
    embedding: number[],
    text: string,
    model: string,
  ): Promise<void> {
    const session = this.driver.session();
    try {
      await session.executeWrite((tx) =>
        tx.run(UPSERT_EMBEDDING, {
          name,
          embedding,
          embeddingText: text,
          embeddingModel: model,
        }),
      );
    } finally {
      await session.close();
    }
  }

  /** Seed-node identification (Module 4/Stage 1): nodes whose embedding is
   *  close enough to `vector` to be a plausible entry point into the graph.
   *  The threshold is applied here, in Cypher, so callers only ever see
   *  candidates that already cleared it. */
  async findSeedNodesByVector(
    vector: number[],
    threshold: number,
    limit = 10,
  ): Promise<SeedNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.executeRead((tx) =>
        tx.run(FIND_SEED_NODES, {
          indexName: VECTOR_INDEX_NAME,
          vector,
          threshold,
          limit: neo4j.int(limit),
        }),
      );
      return result.records.map((r) => ({
        name: r.get('name') as string,
        score: r.get('score') as number,
      }));
    } finally {
      await session.close();
    }
  }
}
