import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { type Driver } from 'neo4j-driver';
import { escapeLuceneQuery } from './lucene.js';
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

const GET_EMBEDDING_TEXT = `
MATCH (e:Entity { name: $name })
RETURN e.embeddingText AS text
`;

const FIND_SEED_NODES = `
CALL db.index.vector.queryNodes($indexName, $limit, $vector)
YIELD node, score
WHERE score >= $threshold
RETURN node.name AS name, score
`;

/**
 * Entity resolution (Stage 3): fixed literal, same reasoning as
 * VECTOR_INDEX_NAME. Created here too (ensureFulltextIndex) even though
 * Iryna already created it by hand, so a fresh environment doesn't depend
 * on that manual step having happened.
 */
const FULLTEXT_INDEX_NAME = 'entity_name_fulltext';

const CREATE_FULLTEXT_INDEX = `
CREATE FULLTEXT INDEX ${FULLTEXT_INDEX_NAME} IF NOT EXISTS
FOR (n:Entity) ON EACH [n.name]
`;

const ENTITY_EXISTS = `
MATCH (e:Entity { name: $name })
RETURN count(e) > 0 AS exists
`;

/**
 * Plain tokenized match, not Lucene fuzzy (`~`) — deliberately, for now.
 * Tokenization alone already finds "Acme Corp" when searching "Acme" (both
 * share the token "acme"), which is the case this project keeps using as
 * its example. `~` edit-distance fuzzing adds typo tolerance but is awkward
 * to build correctly for multi-word names without a more careful query
 * builder; deferred until a real typo case justifies it.
 */
const FIND_CANDIDATES_BY_FULLTEXT = `
CALL db.index.fulltext.queryNodes($indexName, $query, { limit: $limit })
YIELD node, score
RETURN node.name AS name, score
`;

/** Same "fixed literal, not user input" reasoning as VECTOR_INDEX_NAME. */
const PROJECTION_NAME = 'kg';

/**
 * `orientation: 'UNDIRECTED'` is load-bearing, not a style choice — verified
 * live against this project's data. Relations are stored subject->object as
 * extracted ("platform team -RESPONSIBLE_FOR-> billing", "maria -MANAGES->
 * platform team"), and GDS PageRank only walks a relationship's *stored*
 * direction by default. Seeded from "billing" with the default (NATURAL)
 * orientation, `platform team` and `maria` scored exactly 0 — there is no
 * outgoing edge from "billing" toward them, only incoming ones, so the walk
 * can never reach them. `getNeighborhood`'s Cypher never had this problem
 * because `MATCH (e)-[r:REL]-(:Entity)` has no arrow — undirected already.
 * UNDIRECTED here makes the projection match that same behaviour.
 */
const CREATE_PROJECTION = `
CALL gds.graph.project($projectionName, 'Entity', { REL: { orientation: 'UNDIRECTED' } })
`;

/**
 * `false` = don't fail if the named graph doesn't exist yet — makes this
 * safe to call unconditionally before every (re)create, both at startup
 * (nothing projected yet) and after every ingest (something already is).
 * Unlike the vector index, a projection is a disposable in-memory snapshot
 * with no persisted state to lose, so there's no dimension-mismatch class of
 * bug to guard against here — drop-then-recreate is always safe.
 */
const DROP_PROJECTION = `
CALL gds.graph.drop($projectionName, false) YIELD graphName RETURN graphName
`;

const PERSONALIZED_PAGERANK = `
MATCH (n:Entity) WHERE n.name IN $seedNames
WITH collect(n) AS sourceNodes
CALL gds.pageRank.stream($projectionName, {
  sourceNodes: sourceNodes,
  dampingFactor: $dampingFactor,
  maxIterations: $maxIterations
})
YIELD nodeId, score
WHERE score > 0
RETURN gds.util.asNode(nodeId).name AS name, score
ORDER BY score DESC
LIMIT $topN
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

/**
 * Stage 3: the growing, "closed-for-now" relation vocabulary described to
 * the extraction LLM. The graph itself is the source of truth for what's
 * already known — no separate table to keep in sync. Empty result on the
 * first-ever ingest is expected and handled by the prompt, not here.
 */
const KNOWN_RELATION_TYPES = `
MATCH ()-[r:REL]->()
RETURN DISTINCT r.type AS type
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
    await this.ensureFulltextIndex();
    // Built here too (not only after ingest) so a /query before any /ingest
    // ever ran hits an empty-but-existing projection instead of a missing one.
    await this.refreshProjection();
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

  /** No dimension-mismatch class of bug here (unlike the vector index) — a
   *  full-text index has no model-dependent shape, so IF NOT EXISTS alone
   *  is safe, no pre-check needed. */
  private async ensureFulltextIndex(): Promise<void> {
    const session = this.driver.session();
    try {
      await session.executeWrite((tx) => tx.run(CREATE_FULLTEXT_INDEX));
    } finally {
      await session.close();
    }
  }

  /** Cheap short-circuit for entity resolution: an exact-name match is
   *  already handled correctly by MERGE, so IngestService skips the whole
   *  candidate-search + LLM-confirm path whenever this is true. */
  async entityExists(name: string): Promise<boolean> {
    const session = this.driver.session();
    try {
      const result = await session.executeRead((tx) =>
        tx.run(ENTITY_EXISTS, { name }),
      );
      return result.records[0].get('exists') as boolean;
    } finally {
      await session.close();
    }
  }

  /** Fuzzy (lexical) half of entity-resolution candidate generation — the
   *  other half is the existing vector search (findSeedNodesByVector),
   *  called by IngestService with its own candidate threshold. The two are
   *  independent signals feeding the same LLM-confirm step, not combined
   *  into one score (Lucene's score and cosine similarity aren't on
   *  comparable scales). */
  async findCandidatesByFulltext(
    name: string,
    limit = 5,
  ): Promise<SeedNode[]> {
    const session = this.driver.session();
    try {
      const result = await session.executeRead((tx) =>
        tx.run(FIND_CANDIDATES_BY_FULLTEXT, {
          indexName: FULLTEXT_INDEX_NAME,
          query: escapeLuceneQuery(name),
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

  /** Used by entity-resolution confirmation to ground the LLM's yes/no in
   *  the candidate's actual known facts rather than its bare name — a new
   *  name has no such context yet (no edges), so the comparison is
   *  deliberately asymmetric. Null for a node that hasn't been embedded yet
   *  (shouldn't happen for anything findable as a candidate, but the type
   *  stays honest about it). */
  async getEmbeddingText(name: string): Promise<string | null> {
    const session = this.driver.session();
    try {
      const result = await session.executeRead((tx) =>
        tx.run(GET_EMBEDDING_TEXT, { name }),
      );
      return (result.records[0]?.get('text') as string | undefined) ?? null;
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

  /** Distinct relation types already in the graph, read fresh on every call
   *  (not cached) — cheap, and staleness here would defeat the point: the
   *  caller needs the vocabulary as of right now, not as of app startup. */
  async getKnownRelationTypes(): Promise<string[]> {
    const session = this.driver.session();
    try {
      const result = await session.executeRead((tx) =>
        tx.run(KNOWN_RELATION_TYPES),
      );
      return result.records.map((r) => r.get('type') as string);
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

  async refreshProjection(): Promise<void> {
    const session = this.driver.session();
    try {
      await session.executeWrite((tx) =>
        tx.run(DROP_PROJECTION, { projectionName: PROJECTION_NAME }),
      );
      await session.executeWrite((tx) =>
        tx.run(CREATE_PROJECTION, { projectionName: PROJECTION_NAME }),
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Multi-hop retrieval (Module 4/Stage 2): Personalized PageRank seeded
   * from `seedNames` (Stage 1's vector-search hits), replacing the flat
   * 1-hop `getNeighborhood` expansion. `score > 0` in PERSONALIZED_PAGERANK
   * already drops nodes truly unreachable from every seed; `topN` caps how
   * many of the reachable ones make it into the final subgraph (see
   * configuration.ts for why that number is a real tuning knob, not a
   * safety limit).
   *
   * dampingFactor/maxIterations are standard PPR defaults (not exposed as
   * config, unlike topN/similarityThreshold) — 0.85 is the conventional
   * value from the original PageRank paper and rarely changed in practice.
   */
  async personalizedPageRank(
    seedNames: string[],
    topN: number,
  ): Promise<SeedNode[]> {
    if (seedNames.length === 0) return [];

    const session = this.driver.session();
    try {
      const result = await session.executeRead((tx) =>
        tx.run(PERSONALIZED_PAGERANK, {
          projectionName: PROJECTION_NAME,
          seedNames,
          dampingFactor: 0.85,
          maxIterations: neo4j.int(20),
          topN: neo4j.int(topN),
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
