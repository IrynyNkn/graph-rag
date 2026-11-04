import { z } from 'zod';

export interface PdfLine {
  text: string;
  /** Vertical position, growing upwards as in PDF coordinates. */
  y: number;
  fontSize: number;
}

const textItemSchema = z.object({
  str: z.string(),
  height: z.number(),
  hasEOL: z.boolean(),
  transform: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
});
type TextItem = z.infer<typeof textItemSchema>;

/** Rebuilds lines from PDF text items, which arrive in reading order but split at will. */
export function toLines(items: unknown[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let current: PdfLine | null = null;
  for (const item of items.flatMap(parseItem)) {
    const y = item.transform[5];
    if (current === null || startsNewLine(current, y)) {
      current = { text: '', y, fontSize: fontSizeOf(item) };
      lines.push(current);
    }
    current.text += item.str;
    current.fontSize = Math.max(current.fontSize, fontSizeOf(item));
    if (item.hasEOL) {
      current = null;
    }
  }
  return lines
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, ' ').trim() }))
    .filter((line) => line.text.length > 0);
}

function parseItem(item: unknown): TextItem[] {
  const parsed = textItemSchema.safeParse(item);
  return parsed.success ? [parsed.data] : [];
}

function startsNewLine(line: PdfLine, y: number): boolean {
  return Math.abs(line.y - y) > line.fontSize / 2;
}

/** Rounded, because the same font can differ in the last decimals between lines. */
function fontSizeOf(item: TextItem): number {
  const size = item.height > 0 ? item.height : Math.abs(item.transform[3]);
  return Math.round(size * 10) / 10;
}
