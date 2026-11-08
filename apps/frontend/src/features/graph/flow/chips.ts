import { toDisplayName, wrapName } from '../node-names';

// Widths in pixels of the chip font, by the kinds of letters that differ most. Measured on Geist.
const NARROW_LETTERS = /[ijl'.,]/;
const SLIM_LETTERS = /[ftr ]/;
const WIDE_LETTERS = /[mw]/;
const WIDEST_LETTERS = /[MW]/;
const CAPITALS = /[A-Z]/;
const NARROW_WIDTH = 3.1;
const SLIM_WIDTH = 4.2;
const WIDE_WIDTH = 9.5;
const WIDEST_WIDTH = 11;
const CAPITAL_WIDTH = 8;
const LETTER_WIDTH = 6.8;

// A chip takes a little more room than it needs, so that a column never runs into the next one.
const ROOM_MARGIN = 1.06;
// A line starts a little inside its chip and stays hidden behind it, so that no gap can show.
const HIDDEN_MARGIN = 0.94;
const HIDDEN_START = 8;
const SIDE_PADDING = 33;
const ONE_LINE_HEIGHT = 30;
const NEXT_LINE_HEIGHT = 16;

export interface Chip {
  lines: string[];
  /** The room a chip takes up in its column. */
  width: number;
  /** How far from the chip's left edge its lines start. */
  exitOffset: number;
  height: number;
}

export function measureChip(name: string): Chip {
  const lines = wrapName(toDisplayName(name));
  const text = Math.max(...lines.map(estimateTextWidth));
  return {
    lines,
    width: text * ROOM_MARGIN + SIDE_PADDING,
    exitOffset: text * HIDDEN_MARGIN + SIDE_PADDING - HIDDEN_START,
    height: ONE_LINE_HEIGHT + (lines.length - 1) * NEXT_LINE_HEIGHT,
  };
}

/** Good to a few percent, without a canvas and without waiting for the font to load. */
export function estimateTextWidth(text: string): number {
  return [...text].reduce((sum, letter) => sum + widthOf(letter), 0);
}

function widthOf(letter: string): number {
  if (NARROW_LETTERS.test(letter)) {
    return NARROW_WIDTH;
  }
  if (SLIM_LETTERS.test(letter)) {
    return SLIM_WIDTH;
  }
  if (WIDE_LETTERS.test(letter)) {
    return WIDE_WIDTH;
  }
  if (WIDEST_LETTERS.test(letter)) {
    return WIDEST_WIDTH;
  }
  return CAPITALS.test(letter) ? CAPITAL_WIDTH : LETTER_WIDTH;
}
