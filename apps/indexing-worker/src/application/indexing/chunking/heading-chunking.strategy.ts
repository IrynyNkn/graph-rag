import type { DocumentBlock, HeadingBlock, ParsedDocument } from '../parsing/parsed-document.js';
import { ChunkingStrategy, type ChunkDraft } from './chunking-strategy.js';
import { packTexts } from './text-packing.js';

const MIN_HEADINGS = 2;
const SEPARATOR = '\n\n';

interface Section {
  headingPath: string[];
  texts: string[];
}

/** Keeps a section together unless it is too long, and merges short neighbours to save calls. */
export class HeadingChunkingStrategy extends ChunkingStrategy {
  constructor(private readonly maxChars: number) {
    super();
  }

  supports({ blocks }: ParsedDocument): boolean {
    const headings = blocks.filter((block) => block.kind === 'heading').length;
    return headings >= MIN_HEADINGS && headings < blocks.length;
  }

  chunk({ blocks }: ParsedDocument): ChunkDraft[] {
    const drafts = toSections(blocks).flatMap((section) =>
      packTexts(section.texts, this.maxChars).map((text) => ({
        text,
        headingPath: section.headingPath,
      })),
    );
    return this.mergeNeighbours(drafts);
  }

  private mergeNeighbours(drafts: ChunkDraft[]): ChunkDraft[] {
    const merged: ChunkDraft[] = [];
    for (const draft of drafts) {
      const previous = merged.at(-1);
      if (previous && this.fits(previous, draft)) {
        previous.text += SEPARATOR + draft.text;
        previous.headingPath = commonPrefix(previous.headingPath, draft.headingPath);
      } else {
        merged.push({ ...draft });
      }
    }
    return merged;
  }

  private fits(previous: ChunkDraft, next: ChunkDraft): boolean {
    return previous.text.length + SEPARATOR.length + next.text.length <= this.maxChars;
  }
}

/** A heading with no text of its own lives on in the paths below it, and costs no model call. */
function toSections(blocks: DocumentBlock[]): Section[] {
  const sections: Section[] = [];
  let path: HeadingBlock[] = [];
  let current: Section = { headingPath: [], texts: [] };
  sections.push(current);
  for (const block of blocks) {
    if (block.kind === 'heading') {
      path = [...path.filter((heading) => heading.level < block.level), block];
      current = { headingPath: path.map((heading) => heading.text), texts: [block.text] };
      sections.push(current);
    } else {
      current.texts.push(block.text);
    }
  }
  return sections.filter(hasBody);
}

function hasBody({ headingPath, texts }: Section): boolean {
  return texts.length > (headingPath.length > 0 ? 1 : 0);
}

function commonPrefix(first: string[], second: string[]): string[] {
  const end = first.findIndex((heading, index) => heading !== second[index]);
  return end === -1 ? first : first.slice(0, end);
}
