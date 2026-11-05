import type { Line } from './edges';
import type { NodeSide } from './routing';

const PORT_SPACING = 8;
// Ports stay within this share of a node's diameter, so that lines visibly arrive at the node.
const PORT_SPREAD = 0.8;
// A taller stop would run into its neighbours in the column, so its lines squeeze together instead.
const MAX_STRETCH = 48;

export interface Ports {
  /** Vertical offset from the node's center, by `portKey`. */
  offsets: Map<string, number>;
  /** Extra node height that its ports need, by node name. */
  stretches: Map<string, number>;
}

interface SideOfNode {
  name: string;
  radius: number;
  ports: { key: string; otherY: number }[];
}

export function portKey({ edge }: Line, end: 'from' | 'to'): string {
  return `${edge.source}>${edge.target}:${end}`;
}

/**
 * Lines arrive at a node side by side, ordered so that they do not cross on the way in. A node
 * that takes more of them than fit becomes a capsule, like an interchange on a transit diagram.
 */
export function assignPorts(lines: Line[]): Ports {
  const offsets = new Map<string, number>();
  const stretches = new Map<string, number>();
  for (const { name, radius, ports } of groupBySide(lines)) {
    const spread = 2 * PORT_SPREAD * radius;
    const gaps = ports.length - 1;
    const spacing = gaps > 0 ? Math.min(PORT_SPACING, (spread + MAX_STRETCH) / gaps) : 0;
    stretches.set(name, Math.max(stretches.get(name) ?? 0, spacing * gaps - spread));
    ports
      .toSorted((a, b) => a.otherY - b.otherY)
      .forEach(({ key }, index) => offsets.set(key, (index - gaps / 2) * spacing));
  }
  return { offsets, stretches };
}

function groupBySide(lines: Line[]): SideOfNode[] {
  const sides = new Map<string, SideOfNode>();
  const add = (node: Line['from'], side: NodeSide, key: string, otherY: number) => {
    const id = `${node.name}:${side}`;
    const found = sides.get(id) ?? { name: node.name, radius: node.radius, ports: [] };
    found.ports.push({ key, otherY });
    sides.set(id, found);
  };
  for (const line of lines) {
    add(line.from, line.fromSide, portKey(line, 'from'), line.to.y);
    add(line.to, line.toSide, portKey(line, 'to'), line.from.y);
  }
  return [...sides.values()];
}
