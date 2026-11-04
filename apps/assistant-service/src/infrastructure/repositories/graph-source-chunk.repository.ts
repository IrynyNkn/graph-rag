import { citationSchema, type Citation } from '@graph-rag/contracts';
import { GraphStore, graphInt } from '@graph-rag/graph-store';
import { Injectable } from '@nestjs/common';
import { SourceChunkRepository } from '../../application/query/answering/source-chunk.repository.js';
import { FIND_CHUNKS_BY_IDS, FIND_CHUNKS_MENTIONING } from './source-chunk.queries.js';

const citationRowsSchema = citationSchema.array();

@Injectable()
export class GraphSourceChunkRepository extends SourceChunkRepository {
  constructor(private readonly graph: GraphStore) {
    super();
  }

  async findByIds(ids: string[]): Promise<Citation[]> {
    return citationRowsSchema.parse(await this.graph.read(FIND_CHUNKS_BY_IDS, { ids }));
  }

  async findMentioning(names: string[], limit: number): Promise<Citation[]> {
    return citationRowsSchema.parse(
      await this.graph.read(FIND_CHUNKS_MENTIONING, { names, limit: graphInt(limit) }),
    );
  }
}
