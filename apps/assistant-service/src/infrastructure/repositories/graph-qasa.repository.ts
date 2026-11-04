import { GraphStore, graphInt } from '@graph-rag/graph-store';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  QasaGraphRepository,
  type QasaActivation,
} from '../../application/query/retrieval/qasa-graph.repository.js';
import type { RetrievalResult } from '../../application/query/retrieval/retriever.js';
import { AppConfig } from '../../config.js';
import { buildQasaQuery } from './qasa.query.js';

const entitySchema = z.object({
  name: z.string(),
  type: z.string().nullable(),
  description: z.string().nullable(),
  activation: z.number(),
});

const rowSchema = z.object({
  seedNames: z.array(z.string()),
  entities: z.array(entitySchema),
  paths: z.array(
    z.object({
      nodes: z.array(entitySchema),
      edges: z.array(
        z.object({
          relations: z.array(z.string()),
          chunkIds: z.array(z.string()),
          forward: z.boolean(),
        }),
      ),
      weight: z.number(),
    }),
  ),
});

@Injectable()
export class GraphQasaRepository extends QasaGraphRepository {
  private readonly query: string;

  constructor(
    private readonly graph: GraphStore,
    private readonly config: AppConfig,
  ) {
    super();
    this.query = buildQasaQuery(config.qasa.maxSteps);
  }

  async activate({ seeds, questionEmbedding }: QasaActivation): Promise<RetrievalResult> {
    const { decay, threshold, seedsPerEntity, topPaths, topEntities } = this.config.qasa;
    const [row] = await this.graph.read(this.query, {
      entities: seeds,
      questionEmbedding,
      decay,
      threshold,
      seedsPerEntity: graphInt(seedsPerEntity),
      topPaths: graphInt(topPaths),
      topEntities: graphInt(topEntities),
    });
    return rowSchema.parse(row);
  }
}
