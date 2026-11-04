import { extname } from 'node:path';
import type { DocumentFileType } from '@graph-rag/contracts';
import { UnsupportedDocumentTypeError } from './errors.js';

const TYPE_BY_EXTENSION: ReadonlyMap<string, DocumentFileType> = new Map([
  ['.pdf', 'pdf'],
  ['.txt', 'txt'],
  ['.md', 'md'],
  ['.markdown', 'md'],
]);

export function detectDocumentFileType(name: string): DocumentFileType {
  const type = TYPE_BY_EXTENSION.get(extname(name).toLowerCase());
  if (type === undefined) {
    throw new UnsupportedDocumentTypeError(name);
  }
  return type;
}
