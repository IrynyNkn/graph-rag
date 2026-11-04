import { FileStore } from '@graph-rag/file-store';
import { Inject, Injectable } from '@nestjs/common';
import type { IndexableDocument } from '../../document-status.repository.js';
import { EmptyDocumentError, UnsupportedDocumentError } from '../errors.js';
import { DOCUMENT_PARSERS, type DocumentParser } from './document-parser.js';
import type { ParsedDocument } from './parsed-document.js';

@Injectable()
export class DocumentReader {
  constructor(
    private readonly files: FileStore,
    @Inject(DOCUMENT_PARSERS) private readonly parsers: DocumentParser[],
  ) {}

  async read(document: IndexableDocument): Promise<ParsedDocument> {
    const parser = this.parsers.find((candidate) => candidate.supports(document.type));
    if (parser === undefined) {
      throw new UnsupportedDocumentError(document.type);
    }
    const parsed = await parser.parse(await this.files.read(document.id));
    if (parsed.blocks.length === 0) {
      throw new EmptyDocumentError(document.name);
    }
    return parsed;
  }
}
