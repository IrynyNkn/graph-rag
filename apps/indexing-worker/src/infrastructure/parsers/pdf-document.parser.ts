import type { DocumentFileType } from '@graph-rag/contracts';
import { getDocumentProxy } from 'unpdf';
import { DocumentParser } from '../../application/indexing/parsing/document-parser.js';
import type { ParsedDocument } from '../../application/indexing/parsing/parsed-document.js';
import { toBlocks } from './pdf-blocks.js';
import { toLines, type PdfLine } from './pdf-lines.js';
import { PdfWithoutTextError } from './pdf-without-text.error.js';

export class PdfDocumentParser extends DocumentParser {
  supports(type: DocumentFileType): boolean {
    return type === 'pdf';
  }

  async parse(content: Buffer): Promise<ParsedDocument> {
    const pages = await readPages(content);
    const blocks = toBlocks(pages);
    if (blocks.length === 0) {
      throw new PdfWithoutTextError();
    }
    return { blocks };
  }
}

async function readPages(content: Buffer): Promise<PdfLine[][]> {
  const pdf = await getDocumentProxy(new Uint8Array(content));
  try {
    const pages: PdfLine[][] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const { items } = await page.getTextContent();
      pages.push(toLines(items));
    }
    return pages;
  } finally {
    await pdf.loadingTask.destroy();
  }
}
