import { Injectable } from '@nestjs/common';
import type { IndexableDocument } from '../document-status.repository.js';
import { ChunkRepository } from './chunk.repository.js';
import type { DocumentChunk } from './chunking/document-chunker.js';
import { TripleExtractor } from './extraction/triple-extractor.js';
import { EntityResolver } from './resolution/entity-resolver.js';

@Injectable()
export class ChunkIndexer {
  constructor(
    private readonly extractor: TripleExtractor,
    private readonly resolver: EntityResolver,
    private readonly chunks: ChunkRepository,
  ) {}

  async index(document: IndexableDocument, chunk: DocumentChunk): Promise<void> {
    const extraction = await this.extractor.extract(chunk, document.name);
    const resolved = await this.resolver.resolve(extraction);
    await this.chunks.write({
      ...resolved,
      id: `${document.id}:${chunk.ordinal}`,
      documentId: document.id,
      documentName: document.name,
      ordinal: chunk.ordinal,
      text: chunk.text,
    });
  }
}
