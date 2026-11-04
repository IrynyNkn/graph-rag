import type { DocumentFileType } from '@graph-rag/contracts';
import { marked, type Token, type Tokens } from 'marked';
import { DocumentParser } from '../../application/indexing/parsing/document-parser.js';
import type {
  DocumentBlock,
  ParsedDocument,
} from '../../application/indexing/parsing/parsed-document.js';

const CONTENTLESS_TOKENS = new Set(['space', 'hr', 'def']);

export class MarkdownDocumentParser extends DocumentParser {
  supports(type: DocumentFileType): boolean {
    return type === 'md';
  }

  async parse(content: Buffer): Promise<ParsedDocument> {
    const tokens = marked.lexer(content.toString('utf8').replace(/^﻿/, ''));
    return { blocks: tokens.flatMap(toBlocks) };
  }
}

/** Keeps the raw source of anything but headings: code and tables are facts as they stand. */
function toBlocks(token: Token): DocumentBlock[] {
  if (CONTENTLESS_TOKENS.has(token.type)) {
    return [];
  }
  if (token.type === 'heading') {
    const heading = token as Tokens.Heading;
    return [{ kind: 'heading', level: heading.depth, text: heading.text }];
  }
  return [{ kind: 'paragraph', text: token.raw.trim() }];
}
