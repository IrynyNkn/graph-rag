const MARGIN_X = 104;
export const MARGIN_Y = 56;
const MAX_ROW_GAP = 92;
// Room for a node and two lines of its label.
const MIN_ROW_GAP = 76;
const MAX_COLUMN_GAP = 380;
// Room for the widest node label.
const MIN_COLUMN_GAP = 170;
// Below this the labels get too small to read, so the panel scrolls instead.
const MIN_SCALE = 0.7;

export interface Panel {
  width: number;
  height: number;
}

export interface Grid extends Panel {
  /** How much smaller than layout units the picture is drawn. */
  scale: number;
  rowGap: number;
  columnGap: number;
}

/** A dense graph tightens up first and then draws smaller, before the panel has to scroll. */
export function fitGrid(columnGaps: number, rowGaps: number, panel: Panel): Grid {
  const neededWidth = 2 * MARGIN_X + columnGaps * MIN_COLUMN_GAP;
  const neededHeight = 2 * MARGIN_Y + rowGaps * MIN_ROW_GAP;
  const fitting = Math.min(1, panel.width / neededWidth, panel.height / neededHeight);
  const scale = Math.max(MIN_SCALE, fitting);
  const width = panel.width / scale;
  const height = panel.height / scale;
  const rowGap = rowGaps > 0 ? (height - 2 * MARGIN_Y) / rowGaps : MAX_ROW_GAP;
  const columnGap = columnGaps > 0 ? (width - 2 * MARGIN_X) / columnGaps : 0;
  return {
    scale,
    width: Math.max(width, neededWidth),
    height,
    rowGap: clamp(rowGap, MIN_ROW_GAP, MAX_ROW_GAP),
    columnGap: columnGaps > 0 ? clamp(columnGap, MIN_COLUMN_GAP, MAX_COLUMN_GAP) : 0,
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
