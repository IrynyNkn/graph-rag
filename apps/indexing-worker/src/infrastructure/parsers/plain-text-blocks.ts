import type { DocumentBlock } from '../../application/indexing/parsing/parsed-document.js';

const MAX_HEADING_CHARS = 100;
const SENTENCE_END = /[.,;:!?]$/;
const HEADING_LEVEL = 1;

/** Blank lines separate blocks. A lone short line that does not read as a sentence is a heading. */
export function splitPlainText(text: string): DocumentBlock[] {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map(toBlock);
}

function toBlock(block: string): DocumentBlock {
  return looksLikeHeading(block)
    ? { kind: 'heading', level: HEADING_LEVEL, text: block }
    : { kind: 'paragraph', text: block.replace(/\s*\n\s*/g, ' ') };
}

function looksLikeHeading(block: string): boolean {
  return !block.includes('\n') && block.length <= MAX_HEADING_CHARS && !SENTENCE_END.test(block);
}
