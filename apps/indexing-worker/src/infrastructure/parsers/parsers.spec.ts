import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { MarkdownDocumentParser } from './markdown-document.parser.js';
import { PdfDocumentParser } from './pdf-document.parser.js';
import { PdfWithoutTextError } from './pdf-without-text.error.js';
import { splitPlainText } from './plain-text-blocks.js';
import { TextDocumentParser } from './text-document.parser.js';

describe('TextDocumentParser', () => {
  const parser = new TextDocumentParser();

  it('supports only text files', () => {
    expect(parser.supports('txt')).toBe(true);
    expect(parser.supports('pdf')).toBe(false);
  });

  it('splits on blank lines, joins wrapped lines and spots headings', async () => {
    const text = 'SECTION 1: Platform\n\nAlice manages\nthe team.\n\n\nBob joined it.\r\n\r\nEnd';

    const { blocks } = await parser.parse(Buffer.from(text));

    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'SECTION 1: Platform' },
      { kind: 'paragraph', text: 'Alice manages the team.' },
      { kind: 'paragraph', text: 'Bob joined it.' },
      { kind: 'heading', level: 1, text: 'End' },
    ]);
  });

  it('removes a byte order mark', () => {
    expect(splitPlainText('﻿A sentence.')).toEqual([{ kind: 'paragraph', text: 'A sentence.' }]);
  });

  it('does not take a long line for a heading', () => {
    const [block] = splitPlainText('word '.repeat(30).trim());

    expect(block?.kind).toBe('paragraph');
  });

  it('returns nothing for blank text', () => {
    expect(splitPlainText(' \n\n ')).toEqual([]);
  });
});

describe('MarkdownDocumentParser', () => {
  const parser = new MarkdownDocumentParser();

  it('supports only markdown', () => {
    expect(parser.supports('md')).toBe(true);
    expect(parser.supports('txt')).toBe(false);
  });

  it('maps headings with their levels and keeps other blocks as raw text', async () => {
    const markdown = [
      '# Guide',
      '',
      'Intro with **bold**.',
      '',
      '---',
      '',
      '## Setup',
      '',
      '- first',
      '- second',
      '',
      '```ts',
      'const a = 1;',
      '```',
    ].join('\n');

    const { blocks } = await parser.parse(Buffer.from(markdown));

    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Guide' },
      { kind: 'paragraph', text: 'Intro with **bold**.' },
      { kind: 'heading', level: 2, text: 'Setup' },
      { kind: 'paragraph', text: '- first\n- second' },
      { kind: 'paragraph', text: '```ts\nconst a = 1;\n```' },
    ]);
  });
});

describe('PdfDocumentParser', () => {
  const parser = new PdfDocumentParser();

  interface PdfLineSpec {
    text: string;
    size: number;
    y: number;
  }

  async function createPdf(pages: PdfLineSpec[][]): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const lines of pages) {
      const page = pdf.addPage();
      for (const { text, size, y } of lines) {
        page.drawText(text, { x: 50, y, size, font });
      }
    }
    return Buffer.from(await pdf.save());
  }

  it('supports only PDF', () => {
    expect(parser.supports('pdf')).toBe(true);
    expect(parser.supports('md')).toBe(false);
  });

  it('recovers headings and paragraphs from font sizes and gaps', async () => {
    const content = await createPdf([
      [
        { text: 'Annual Report', size: 24, y: 700 },
        { text: 'Alice manages the team and this is a line', size: 12, y: 660 },
        { text: 'that goes on to the next line of text.', size: 12, y: 646 },
        { text: 'Bob joined the team after a clear gap.', size: 12, y: 610 },
      ],
    ]);

    const { blocks } = await parser.parse(content);

    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Annual Report' },
      {
        kind: 'paragraph',
        text: 'Alice manages the team and this is a line that goes on to the next line of text.',
      },
      { kind: 'paragraph', text: 'Bob joined the team after a clear gap.' },
    ]);
  });

  it('continues a paragraph across pages and starts a new one after a full stop', async () => {
    const content = await createPdf([
      [{ text: 'The sentence goes on to', size: 12, y: 700 }],
      [
        { text: 'the next page and ends.', size: 12, y: 700 },
        { text: 'A separate paragraph follows here.', size: 12, y: 650 },
      ],
      [{ text: 'A new page starts after the full stop.', size: 12, y: 700 }],
    ]);

    const { blocks } = await parser.parse(content);

    expect(blocks.map((block) => block.text)).toEqual([
      'The sentence goes on to the next page and ends.',
      'A separate paragraph follows here.',
      'A new page starts after the full stop.',
    ]);
  });

  it('drops page numbers and running headers', async () => {
    const page = (body: string, number: string) => [
      { text: 'ACME Confidential', size: 12, y: 750 },
      { text: body, size: 12, y: 700 },
      { text: number, size: 12, y: 40 },
    ];
    const content = await createPdf([
      page('First page body.', '1'),
      page('Second page body.', '2'),
      page('Third page body.', 'Page 3 of 3'),
    ]);

    const { blocks } = await parser.parse(content);

    expect(blocks.map((block) => block.text)).toEqual([
      'First page body.',
      'Second page body.',
      'Third page body.',
    ]);
  });

  it('joins a word hyphenated across lines', async () => {
    const content = await createPdf([
      [
        { text: 'The knowledge base stores infor-', size: 12, y: 700 },
        { text: 'mation about the team.', size: 12, y: 686 },
      ],
    ]);

    const { blocks } = await parser.parse(content);

    expect(blocks[0]?.text).toBe('The knowledge base stores information about the team.');
  });

  it('rejects a PDF without a text layer', async () => {
    const content = await createPdf([[]]);

    await expect(parser.parse(content)).rejects.toThrow(PdfWithoutTextError);
  });

  it('fails on a file that is not a PDF', async () => {
    await expect(parser.parse(Buffer.from('not a pdf'))).rejects.toThrow();
  });
});
