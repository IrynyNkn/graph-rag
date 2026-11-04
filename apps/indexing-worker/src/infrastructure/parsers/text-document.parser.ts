import type { DocumentFileType } from '@graph-rag/contracts';
import { DocumentParser } from '../../application/indexing/parsing/document-parser.js';
import type { ParsedDocument } from '../../application/indexing/parsing/parsed-document.js';
import { splitPlainText } from './plain-text-blocks.js';

export class TextDocumentParser extends DocumentParser {
  supports(type: DocumentFileType): boolean {
    return type === 'txt';
  }

  async parse(content: Buffer): Promise<ParsedDocument> {
    return { blocks: splitPlainText(content.toString('utf8')) };
  }
}
