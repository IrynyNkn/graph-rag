import type { ParsedDocument } from '../parsing/parsed-document.js';
import { ChunkingStrategy, type ChunkDraft } from './chunking-strategy.js';
import { packTexts } from './text-packing.js';

const MIN_BLOCKS = 2;

/** For text with real paragraphs. A wall of text is left for the sliding window. */
export class ParagraphChunkingStrategy extends ChunkingStrategy {
  constructor(private readonly maxChars: number) {
    super();
  }

  supports({ blocks }: ParsedDocument): boolean {
    const totalChars = blocks.reduce((sum, block) => sum + block.text.length, 0);
    return blocks.length >= MIN_BLOCKS && totalChars / blocks.length <= this.maxChars;
  }

  chunk({ blocks }: ParsedDocument): ChunkDraft[] {
    const texts = packTexts(
      blocks.map((block) => block.text),
      this.maxChars,
    );
    return texts.map((text) => ({ text, headingPath: [] }));
  }
}
