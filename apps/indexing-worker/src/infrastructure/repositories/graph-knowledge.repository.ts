import { GraphStore, graphInt, isConstraintViolation } from '@graph-rag/graph-store';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  KnowledgeRepository,
  type RefreshedEntity,
  type StaleEntity,
} from '../../application/knowledge/knowledge.repository.js';
import {
  DELETE_ORPHANS,
  FIND_STALE_ENTITIES,
  SAVE_REFRESHED_ENTITIES,
} from './knowledge.queries.js';

const MAX_ORPHAN_DELETE_ATTEMPTS = 3;

const staleRowsSchema = z.array(
  z.object({
    name: z.string(),
    revision: z.number(),
    description: z.string().nullable(),
    hasEmbedding: z.boolean(),
    mentions: z.array(z.string()),
  }),
);

@Injectable()
export class GraphKnowledgeRepository extends KnowledgeRepository {
  constructor(private readonly graph: GraphStore) {
    super();
  }

  async deleteOrphans(): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.graph.write(DELETE_ORPHANS);
        return;
      } catch (error) {
        if (!isConstraintViolation(error) || attempt >= MAX_ORPHAN_DELETE_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  async findStale(limit: number): Promise<StaleEntity[]> {
    return staleRowsSchema.parse(
      await this.graph.read(FIND_STALE_ENTITIES, { limit: graphInt(limit) }),
    );
  }

  async saveRefreshed(entities: RefreshedEntity[]): Promise<void> {
    await this.graph.write(SAVE_REFRESHED_ENTITIES, {
      entities: entities.map((entity) => ({ ...entity, revision: graphInt(entity.revision) })),
    });
  }
}
