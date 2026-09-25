import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { type Driver } from 'neo4j-driver';
import type { Subgraph, SubgraphEdge, Triple } from './graph.types.js';

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

  onModuleInit(): void {
    this.driver = neo4j.driver(
      this.config.getOrThrow<string>('neo4j.uri'),
      neo4j.auth.basic(
        this.config.getOrThrow<string>('neo4j.user'),
        this.config.getOrThrow<string>('neo4j.password'),
      ),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.driver?.close();
  }

  /** Expects already-normalised triples (trimmed, lower-cased names). */
  async upsertTriples(triples: Triple[]): Promise<void> {
    if (triples.length === 0) return;
    const session = this.driver.session();
    try {
      await session.executeWrite((tx) => tx.run(UPSERT_TRIPLES, { triples }));
    } finally {
      await session.close();
    }
  }

  /** `names` must already be normalised the same way as ingested entity names. */
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
}
