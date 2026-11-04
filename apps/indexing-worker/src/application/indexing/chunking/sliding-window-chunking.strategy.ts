import type { ParsedDocument } from '../parsing/parsed-document.js';
import { ChunkingStrategy, type ChunkDraft } from './chunking-strategy.js';

/** The fallback: it supports everything, so it must stay last in the list. */
export class SlidingWindowChunkingStrategy extends ChunkingStrategy {
  constructor(
    private readonly maxChars: number,
    private readonly overlapChars: number,
  ) {
    super();
  }

  supports(): boolean {
    return true;
  }

  chunk({ blocks }: ParsedDocument): ChunkDraft[] {
    const text = blocks.map((block) => block.text).join('\n\n');
    const drafts: ChunkDraft[] = [];
    let start = 0;
    while (start < text.length) {
      const end = this.findEnd(text, start);
      drafts.push({ text: text.slice(start, end).trim(), headingPath: [] });
      start = end >= text.length ? end : this.nextStart(text, start, end);
    }
    return drafts.filter((draft) => draft.text.length > 0);
  }

  /** Ends at the last space in the window, unless the only one is too early to be useful. */
  private findEnd(text: string, start: number): number {
    const limit = start + this.maxChars;
    if (limit >= text.length) {
      return text.length;
    }
    const space = text.lastIndexOf(' ', limit);
    return space > start + this.maxChars / 2 ? space : limit;
  }

  /** Steps back by the overlap and on to the next word, always moving forward. */
  private nextStart(text: string, start: number, end: number): number {
    const overlapped = Math.max(end - this.overlapChars, start + 1);
    const space = text.indexOf(' ', overlapped);
    return space !== -1 && space < end ? space + 1 : end;
  }
}
