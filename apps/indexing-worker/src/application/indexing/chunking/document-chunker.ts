import { Inject, Injectable } from '@nestjs/common';
import type { ParsedDocument } from '../parsing/parsed-document.js';
import {
  CHUNKING_STRATEGIES,
  type ChunkDraft,
  type ChunkingStrategy,
} from './chunking-strategy.js';

export interface DocumentChunk extends ChunkDraft {
  ordinal: number;
}

@Injectable()
export class DocumentChunker {
  constructor(@Inject(CHUNKING_STRATEGIES) private readonly strategies: ChunkingStrategy[]) {}

  chunk(document: ParsedDocument): DocumentChunk[] {
    const strategy = this.strategies.find((candidate) => candidate.supports(document));
    if (strategy === undefined) {
      throw new Error('No chunking strategy supports this document');
    }
    return strategy.chunk(document).map((draft, ordinal) => ({ ...draft, ordinal }));
  }
}
