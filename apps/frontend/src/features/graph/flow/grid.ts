const MARGIN_X = 22;
// Above the rows there is the line of column labels.
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 56;
const MIN_ROW_GAP = 54;
const MAX_ROW_GAP = 88;
// Curves between columns get unreadably steep in less than this.
const MIN_CURVE_GAP = 36;
const MAX_CURVE_GAP = 190;
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
  curveGap: number;
  left: number;
  top: number;
}

/** A dense graph tightens up first and then draws smaller, before the panel has to scroll. */
export function fitGrid(columnWidths: number[], rowGaps: number, panel: Panel): Grid {
  const taken = columnWidths.reduce((sum, width) => sum + width, 0);
  const curves = Math.max(columnWidths.length - 1, 0);
  const neededWidth = 2 * MARGIN_X + taken + curves * MIN_CURVE_GAP;
  const neededHeight = MARGIN_TOP + MARGIN_BOTTOM + rowGaps * MIN_ROW_GAP;
  const fitting = Math.min(1, panel.width / neededWidth, panel.height / neededHeight);
  const scale = Math.max(MIN_SCALE, fitting);
  const width = panel.width / scale;
  const height = panel.height / scale;

  const roomForCurves = (width - 2 * MARGIN_X - taken) / Math.max(curves, 1);
  const curveGap = clamp(roomForCurves, MIN_CURVE_GAP, MAX_CURVE_GAP);
  const roomForRows = (height - MARGIN_TOP - MARGIN_BOTTOM) / Math.max(rowGaps, 1);
  const rowGap = clamp(roomForRows, MIN_ROW_GAP, MAX_ROW_GAP);

  const contentWidth = taken + curves * curveGap;
  const contentHeight = rowGaps * rowGap;
  const left = Math.max(MARGIN_X, (width - contentWidth) / 2);
  const top = Math.max(MARGIN_TOP, (height - contentHeight) / 2);
  return {
    scale,
    rowGap,
    curveGap,
    left,
    top,
    width: Math.max(width, left + contentWidth + MARGIN_X),
    height: Math.max(height, top + contentHeight + MARGIN_BOTTOM),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
