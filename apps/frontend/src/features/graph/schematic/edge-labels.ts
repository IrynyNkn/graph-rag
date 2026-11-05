import type { Point } from './routing';

const CHAR_WIDTH = 7.2;
const ARROW_WIDTH = 14;
// Keeps the text clear of the line that bends into the run.
const BEND_ROOM = 14;
const GAP = 6;
const LIFT = 5;
const TEXT_HEIGHT = 9;

export interface EdgeLabel extends Point {
  anchor: 'start' | 'end';
}

export interface LabelledEnd {
  name: string;
  radius: number;
  labelAbove: boolean;
}

/**
 * Text sits next to a node on a straight run, where lines have already fanned out, and on the side
 * of the line away from the node's own label. Each node side takes one label, so the strongest
 * edges go first, and the rest show on hover only.
 */
export function findLabelSpot(
  text: string,
  points: Point[],
  from: LabelledEnd,
  to: LabelledEnd,
  lineWidth: number,
  taken: Set<string>,
): EdgeLabel | null {
  const needed = text.length * CHAR_WIDTH + ARROW_WIDTH + BEND_ROOM;
  const first = points[0];
  const last = points.at(-1);
  const beforeLast = points.at(-2);
  const second = points[1];
  if (!first || !second || !last || !beforeLast) {
    return null;
  }
  const atEnd = fits(last, beforeLast, to, needed, `${to.name}:in`, taken);
  if (atEnd) {
    taken.add(`${to.name}:in`);
    const y = besideLine(last.y, lineWidth, to);
    return { x: last.x - to.radius - GAP, y, anchor: 'end' };
  }
  if (fits(first, second, from, needed, `${from.name}:out`, taken)) {
    taken.add(`${from.name}:out`);
    const y = besideLine(first.y, lineWidth, from);
    return { x: first.x + from.radius + GAP, y, anchor: 'start' };
  }
  return null;
}

function fits(
  end: Point,
  next: Point,
  node: LabelledEnd,
  needed: number,
  key: string,
  taken: Set<string>,
): boolean {
  const isStraight = end.y === next.y;
  return isStraight && !taken.has(key) && Math.abs(end.x - next.x) - node.radius - GAP >= needed;
}

function besideLine(y: number, lineWidth: number, node: LabelledEnd): number {
  const distance = lineWidth / 2 + LIFT;
  return node.labelAbove ? y + distance + TEXT_HEIGHT : y - distance;
}
