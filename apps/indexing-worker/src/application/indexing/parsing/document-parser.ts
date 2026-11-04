import type { DocumentFileType } from '@graph-rag/contracts';
import type { ParsedDocument } from './parsed-document.js';

export const DOCUMENT_PARSERS = Symbol('DOCUMENT_PARSERS');

export abstract class DocumentParser {
  abstract supports(type: DocumentFileType): boolean;
  abstract parse(content: Buffer): Promise<ParsedDocument>;
}
