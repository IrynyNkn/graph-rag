// Share of the distance between columns that a curve keeps running level at each end.
const HANDLE_SHARE = 0.5;

export interface Point {
  x: number;
  y: number;
}

export interface Curve {
  path: string;
  middle: Point;
}

/** Leaves and arrives level, so that lines of one fan run side by side before they part. */
export function curveAcross(from: Point, to: Point): Curve {
  const handle = (to.x - from.x) * HANDLE_SHARE;
  return toCurve(from, { x: from.x + handle, y: from.y }, { x: to.x - handle, y: to.y }, to);
}

/** Bows out to the right of a column, further for nodes further apart, so that arcs can nest. */
export function curveBeside(from: Point, to: Point, reach: number): Curve {
  return toCurve(from, { x: from.x + reach, y: from.y }, { x: to.x + reach, y: to.y }, to);
}

// Every curve has the same commands, which is what lets one morph into another.
function toCurve(start: Point, first: Point, second: Point, end: Point): Curve {
  return {
    path: `M ${at(start)} C ${at(first)} ${at(second)} ${at(end)}`,
    middle: {
      x: (start.x + 3 * first.x + 3 * second.x + end.x) / 8,
      y: (start.y + 3 * first.y + 3 * second.y + end.y) / 8,
    },
  };
}

function at({ x, y }: Point): string {
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}
