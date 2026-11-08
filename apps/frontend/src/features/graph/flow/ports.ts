import type { Line } from './edges';

const PORT_SPACING = 5;
// A chip's corners are rounded, so lines stay this far from its top and bottom.
const CORNER = 6;

type LineEnd = 'from' | 'to';

export function portKey({ edge }: Line, end: LineEnd): string {
  return `${edge.source}>${edge.target}:${end}`;
}

/** Lines meet a chip side by side, ordered so that they do not cross on the way in. */
export function assignPorts(lines: Line[]): Map<string, number> {
  const offsets = new Map<string, number>();
  for (const { height, ports } of groupBySide(lines)) {
    const gaps = ports.length - 1;
    const spacing = gaps > 0 ? Math.min(PORT_SPACING, (height - 2 * CORNER) / gaps) : 0;
    ports
      .toSorted((a, b) => a.otherY - b.otherY)
      .forEach(({ key }, index) => offsets.set(key, (index - gaps / 2) * spacing));
  }
  return offsets;
}

interface ChipSide {
  height: number;
  ports: { key: string; otherY: number }[];
}

function groupBySide(lines: Line[]): ChipSide[] {
  const sides = new Map<string, ChipSide>();
  const add = (node: Line['from'], side: string, key: string, otherY: number) => {
    const id = `${node.name}:${side}`;
    const found = sides.get(id) ?? { height: node.height, ports: [] };
    found.ports.push({ key, otherY });
    sides.set(id, found);
  };
  for (const line of lines) {
    add(line.from, 'right', portKey(line, 'from'), line.to.y);
    add(line.to, line.isWithinColumn ? 'right' : 'left', portKey(line, 'to'), line.from.y);
  }
  return [...sides.values()];
}
