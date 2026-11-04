import type { DocumentBlock } from '../../application/indexing/parsing/parsed-document.js';
import type { PdfLine } from './pdf-lines.js';

const HEADING_FONT_RATIO = 1.15;
const MAX_HEADING_CHARS = 120;
const PARAGRAPH_GAP_RATIO = 1.6;
const SENTENCE_END = /[.!?:]["')\]]?$/;
const PAGE_NUMBER = /^(page\s+)?\d+(\s*(of|\/)\s*\d+)?$/i;
// A line on this share of pages is a running header or footer.
const RUNNING_LINE_PAGE_SHARE = 0.5;
const MIN_PAGES_FOR_RUNNING_LINES = 3;

/** PDF has no structure, so paragraphs and headings are inferred from gaps and font sizes. */
export function toBlocks(pages: PdfLine[][]): DocumentBlock[] {
  const cleaned = removeRunningLines(pages);
  const bodySize = findBodyFontSize(cleaned.flat());
  const headingLevels = rankHeadingSizes(cleaned.flat(), bodySize);
  const blocks: DocumentBlock[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: joinLines(paragraph) });
      paragraph = [];
    }
  };

  for (const page of cleaned) {
    page.forEach((line, index) => {
      const level = headingLevels.get(line.fontSize);
      if (level !== undefined && line.text.length <= MAX_HEADING_CHARS) {
        flush();
        blocks.push({ kind: 'heading', level, text: line.text });
        return;
      }
      if (startsParagraph(page[index - 1], line, paragraph.at(-1))) {
        flush();
      }
      paragraph.push(line.text);
    });
  }
  flush();
  return blocks;
}

function removeRunningLines(pages: PdfLine[][]): PdfLine[][] {
  const pagesWithLine = new Map<string, number>();
  for (const page of pages) {
    for (const text of new Set(page.map((line) => line.text))) {
      pagesWithLine.set(text, (pagesWithLine.get(text) ?? 0) + 1);
    }
  }
  const threshold =
    pages.length >= MIN_PAGES_FOR_RUNNING_LINES
      ? pages.length * RUNNING_LINE_PAGE_SHARE
      : Number.POSITIVE_INFINITY;
  return pages.map((page) =>
    page.filter(
      (line) => !PAGE_NUMBER.test(line.text) && (pagesWithLine.get(line.text) ?? 0) < threshold,
    ),
  );
}

/** The size that carries the most characters is the body text. */
function findBodyFontSize(lines: PdfLine[]): number {
  const charsBySize = new Map<number, number>();
  for (const line of lines) {
    charsBySize.set(line.fontSize, (charsBySize.get(line.fontSize) ?? 0) + line.text.length);
  }
  let bodySize = 0;
  let mostChars = 0;
  for (const [size, chars] of charsBySize) {
    if (chars > mostChars) {
      bodySize = size;
      mostChars = chars;
    }
  }
  return bodySize;
}

function rankHeadingSizes(lines: PdfLine[], bodySize: number): Map<number, number> {
  const sizes = new Set(lines.map((line) => line.fontSize));
  const headingSizes = [...sizes]
    .filter((size) => size > bodySize * HEADING_FONT_RATIO)
    .toSorted((a, b) => b - a);
  return new Map(headingSizes.map((size, index) => [size, index + 1]));
}

function startsParagraph(
  previous: PdfLine | undefined,
  line: PdfLine,
  lastText: string | undefined,
): boolean {
  if (lastText === undefined) {
    return false;
  }
  // At the top of a page only punctuation can tell whether the paragraph went on.
  if (previous === undefined) {
    return SENTENCE_END.test(lastText);
  }
  return previous.y - line.y > previous.fontSize * PARAGRAPH_GAP_RATIO;
}

function joinLines(lines: string[]): string {
  return lines.reduce((text, line) => {
    if (text.endsWith('-') && /^[a-z]/.test(line)) {
      return text.slice(0, -1) + line;
    }
    return `${text} ${line}`;
  });
}
