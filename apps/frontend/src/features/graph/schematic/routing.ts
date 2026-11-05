// The same for every line that leaves a node, so that lines of one fan do not cross.
const MIN_STRAIGHT_RUN = 16;
// A shorter one looks like a kink, so the slant gets a little steeper instead.
const MIN_VERTICAL_RUN = 24;
const SIDE_RUN = 24;
const ARC_GROWTH = 14;
const CORNER = 14;

export interface Point {
  x: number;
  y: number;
}

export type NodeSide = 'left' | 'right';

/** Horizontal, 45 degree and vertical runs only, as on a transit diagram. */
export function routeAcrossColumns(from: Point, to: Point): Point[] {
  const rise = Math.abs(to.y - from.y);
  const run = to.x - from.x;
  if (rise < 1) {
    return [from, { x: to.x, y: from.y }];
  }
  const straight = Math.max(Math.min(MIN_STRAIGHT_RUN, run / 2), (run - rise) / 2);
  if (rise - (run - 2 * straight) < MIN_VERTICAL_RUN) {
    return [from, { x: from.x + straight, y: from.y }, { x: to.x - straight, y: to.y }, to];
  }
  const slant = run / 2 - straight;
  const direction = Math.sign(to.y - from.y);
  return [
    from,
    { x: from.x + straight, y: from.y },
    { x: from.x + straight + slant, y: from.y + direction * slant },
    { x: to.x - straight - slant, y: to.y - direction * slant },
    { x: to.x - straight, y: to.y },
    to,
  ];
}

/** A wider arc for nodes further apart, so that arcs of one column nest instead of touching. */
export function routeWithinColumn(from: Point, to: Point, side: NodeSide, rowGap: number): Point[] {
  const outward = side === 'left' ? -1 : 1;
  const direction = Math.sign(to.y - from.y) || 1;
  const rows = Math.round(Math.abs(to.y - from.y) / rowGap);
  const reach = SIDE_RUN + rows * ARC_GROWTH;
  return [
    from,
    { x: from.x + outward * reach, y: from.y },
    { x: from.x + outward * (reach + SIDE_RUN), y: from.y + direction * SIDE_RUN },
    { x: from.x + outward * (reach + SIDE_RUN), y: to.y - direction * SIDE_RUN },
    { x: from.x + outward * reach, y: to.y },
    to,
  ];
}

export function toRoundedPath(points: Point[]): string {
  const [first] = points;
  if (first === undefined) {
    return '';
  }
  let path = `M ${first.x} ${first.y}`;
  points.slice(1, -1).forEach((corner, index) => {
    const before = points[index] ?? corner;
    const after = points[index + 2] ?? corner;
    const entry = towards(corner, before);
    const exit = towards(corner, after);
    path += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  });
  const last = points.at(-1) ?? first;
  return `${path} L ${last.x} ${last.y}`;
}

function towards(from: Point, to: Point): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const step = length > 0 ? Math.min(CORNER, length / 2) / length : 0;
  return { x: from.x + (to.x - from.x) * step, y: from.y + (to.y - from.y) * step };
}
