import type { ParsedDocument } from '../parsing/parsed-document.js';

export const CHUNKING_STRATEGIES = Symbol('CHUNKING_STRATEGIES');

export interface ChunkDraft {
  text: string;
  headingPath: string[];
}

/**
 * Strategies must be deterministic: chunk IDs depend on their output, and a redelivered job
 * finds the chunks it has already written by those IDs.
 */
export abstract class ChunkingStrategy {
  abstract supports(document: ParsedDocument): boolean;
  abstract chunk(document: ParsedDocument): ChunkDraft[];
}
