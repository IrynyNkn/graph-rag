import { GraphStore } from '@graph-rag/graph-store';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DocumentGraphRepository } from '../../application/removal/document-graph.repository.js';
import {
  FIND_CHUNK_IDS,
  REMOVE_CHUNKS,
  REMOVE_RELATION_ENTRIES,
} from './document-removal.queries.js';

const chunkRowsSchema = z.array(z.object({ id: z.string() }));

@Injectable()
export class GraphDocumentRepository extends DocumentGraphRepository {
  constructor(private readonly graph: GraphStore) {
    super();
  }

  async removeDocument(documentId: string): Promise<void> {
    await this.graph.transaction(async (transaction) => {
      const rows = chunkRowsSchema.parse(await transaction.run(FIND_CHUNK_IDS, { documentId }));
      const chunkIds = rows.map((row) => row.id);
      await transaction.run(REMOVE_RELATION_ENTRIES, { documentId, chunkIds });
      await transaction.run(REMOVE_CHUNKS, { documentId });
    });
  }
}
