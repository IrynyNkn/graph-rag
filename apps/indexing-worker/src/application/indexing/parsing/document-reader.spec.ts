import { InMemoryFileStore } from '@graph-rag/testing';
import { describe, expect, it } from 'vitest';
import { EmptyDocumentError, UnsupportedDocumentError } from '../errors.js';
import { DocumentParser } from './document-parser.js';
import { DocumentReader } from './document-reader.js';
import type { ParsedDocument } from './parsed-document.js';

class StubParser extends DocumentParser {
  constructor(private readonly parsed: ParsedDocument) {
    super();
  }

  supports(type: string): boolean {
    return type === 'txt';
  }

  async parse(): Promise<ParsedDocument> {
    return this.parsed;
  }
}

describe('DocumentReader', () => {
  const blocks: ParsedDocument['blocks'] = [{ kind: 'paragraph', text: 'Alice.' }];
  const document = { id: 'id', name: 'a.txt', type: 'txt' as const };

  async function createReader(parsed: ParsedDocument): Promise<DocumentReader> {
    const files = new InMemoryFileStore();
    await files.save(document.id, Buffer.from('content'));
    return new DocumentReader(files, [new StubParser(parsed)]);
  }

  it('reads the file with the parser that supports its type', async () => {
    const reader = await createReader({ blocks });

    await expect(reader.read(document)).resolves.toEqual({ blocks });
  });

  it('fails when no parser supports the type', async () => {
    const reader = await createReader({ blocks });

    await expect(reader.read({ ...document, type: 'pdf' })).rejects.toThrow(
      UnsupportedDocumentError,
    );
  });

  it('fails for a document without any text', async () => {
    const reader = await createReader({ blocks: [] });

    await expect(reader.read(document)).rejects.toThrow(EmptyDocumentError);
  });
});
