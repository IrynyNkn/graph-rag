import { GraphStore, graphInt } from '@graph-rag/graph-store';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ChunkRepository, type ChunkToWrite } from '../../application/indexing/chunk.repository.js';
import {
  ADD_MENTIONS,
  ADD_RELATIONS,
  CREATE_CHUNK,
  FIND_WRITTEN_ORDINALS,
} from './chunk.queries.js';

const ordinalRowsSchema = z.array(z.object({ ordinal: z.number() }));

@Injectable()
export class GraphChunkRepository extends ChunkRepository {
  constructor(private readonly graph: GraphStore) {
    super();
  }

  async findWrittenOrdinals(documentId: string): Promise<Set<number>> {
    const rows = ordinalRowsSchema.parse(
      await this.graph.read(FIND_WRITTEN_ORDINALS, { documentId }),
    );
    return new Set(rows.map((row) => row.ordinal));
  }

  async write(chunk: ChunkToWrite): Promise<void> {
    // Locking entities in one global order keeps parallel chunk writes from deadlocking.
    const entities = chunk.entities.toSorted((a, b) => a.name.localeCompare(b.name));
    await this.graph.transaction(async (transaction) => {
      await transaction.run(CREATE_CHUNK, {
        id: chunk.id,
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        ordinal: graphInt(chunk.ordinal),
        text: chunk.text,
      });
      await transaction.run(ADD_MENTIONS, { id: chunk.id, entities });
      await transaction.run(ADD_RELATIONS, { id: chunk.id, triples: chunk.triples });
    });
  }
}
