import type { GraphEdge } from '@graph-rag/contracts';
import type { PlacedEdge, PlacedNode } from './layout';
import { assignPorts, portKey } from './ports';
import { curveAcross, curveBeside } from './routing';
import { scale } from './scale';

const MIN_LINE_WIDTH = 0.75;
const MAX_LINE_WIDTH = 3.5;
const ARC_REACH = 26;
const ARC_GROWTH = 10;

/** An edge with its ends in drawing order, from the earlier hop to the later one. */
export interface Line {
  edge: GraphEdge;
  from: PlacedNode;
  to: PlacedNode;
  isWithinColumn: boolean;
}

export function findLines(edges: GraphEdge[], nodes: PlacedNode[]): Line[] {
  const byName = new Map(nodes.map((node) => [node.name, node]));
  return edges.flatMap((edge) => {
    const source = byName.get(edge.source);
    const target = byName.get(edge.target);
    return source === undefined || target === undefined ? [] : [toLine(edge, source, target)];
  });
}

function toLine(edge: GraphEdge, source: PlacedNode, target: PlacedNode): Line {
  if (source.hop === target.hop) {
    const [from, to] = source.y <= target.y ? [source, target] : [target, source];
    return { edge, from, to, isWithinColumn: true };
  }
  const [from, to] = source.hop < target.hop ? [source, target] : [target, source];
  return { edge, from, to, isWithinColumn: false };
}

export function placeEdges(
  lines: Line[],
  edges: GraphEdge[],
  chain: Set<GraphEdge>,
  rowGap: number,
): PlacedEdge[] {
  const weights = edges.map((edge) => edge.weight);
  const heaviest = Math.max(0, ...weights);
  const offsets = assignPorts(lines);
  return lines
    .toSorted((a, b) => b.edge.weight - a.edge.weight)
    .map((line) => {
      const { edge, from } = line;
      const curve = routeLine(line, offsets, rowGap);
      return {
        ...edge,
        id: `${edge.source}>${edge.target}`,
        path: curve.path,
        lineWidth: scale(edge.weight, weights, MIN_LINE_WIDTH, MAX_LINE_WIDTH),
        strength: heaviest > 0 ? edge.weight / heaviest : 0,
        isInStrongestChain: chain.has(edge),
        readsForward: edge.source === from.name,
        hop: from.hop,
        midX: curve.middle.x,
        midY: curve.middle.y,
      };
    });
}

function routeLine(line: Line, offsets: Map<string, number>, rowGap: number) {
  const { from, to, isWithinColumn } = line;
  const start = {
    x: from.x + from.exitOffset,
    y: from.y + (offsets.get(portKey(line, 'from')) ?? 0),
  };
  const endY = to.y + (offsets.get(portKey(line, 'to')) ?? 0);
  if (!isWithinColumn) {
    return curveAcross(start, { x: to.x, y: endY });
  }
  const rows = Math.round(Math.abs(to.y - from.y) / rowGap);
  return curveBeside(start, { x: to.x + to.exitOffset, y: endY }, ARC_REACH + rows * ARC_GROWTH);
}
