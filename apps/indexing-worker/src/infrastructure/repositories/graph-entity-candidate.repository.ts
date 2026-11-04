import { GraphStore, graphInt } from '@graph-rag/graph-store';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  EntityCandidateRepository,
  type EntityCandidate,
} from '../../application/indexing/resolution/entity-candidate.repository.js';
import { FIND_CANDIDATES, FIND_EXISTING_NAMES } from './entity-candidate.queries.js';
import { toLuceneQuery } from './lucene-query.js';

const MENTIONS_PER_CANDIDATE = 2;

const nameRowsSchema = z.array(z.object({ name: z.string() }));
const candidateRowsSchema = z.array(
  z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
    mentions: z.array(z.string()),
  }),
);

@Injectable()
export class GraphEntityCandidateRepository extends EntityCandidateRepository {
  constructor(private readonly graph: GraphStore) {
    super();
  }

  async findExistingNames(names: string[]): Promise<Set<string>> {
    const rows = nameRowsSchema.parse(await this.graph.read(FIND_EXISTING_NAMES, { names }));
    return new Set(rows.map((row) => row.name));
  }

  async findCandidates(name: string, limit: number): Promise<EntityCandidate[]> {
    const rows = candidateRowsSchema.parse(
      await this.graph.read(FIND_CANDIDATES, {
        query: toLuceneQuery(name),
        limit: graphInt(limit),
        mentionsPerCandidate: graphInt(MENTIONS_PER_CANDIDATE),
      }),
    );
    return rows.map((row) => ({
      name: row.name,
      type: row.type,
      description: row.description || row.mentions.join(' '),
    }));
  }
}
