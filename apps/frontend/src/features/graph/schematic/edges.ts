import type { GraphEdge } from '@graph-rag/contracts';
import { findLabelSpot } from './edge-labels';
import type { PlacedEdge, PlacedNode } from './layout';
import { portKey } from './ports';
import { routeAcrossColumns, routeWithinColumn, toRoundedPath, type NodeSide } from './routing';
import { scale } from './scale';
import { findStrongestChain } from './strongest-chain';

const MIN_LINE_WIDTH = 2.5;
const MAX_LINE_WIDTH = 9;

/** An edge with its ends in drawing order, from the earlier hop to the later one. */
export interface Line {
  edge: GraphEdge;
  from: PlacedNode;
  to: PlacedNode;
  fromSide: NodeSide;
  toSide: NodeSide;
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
    const side: NodeSide = source.hop === 0 ? 'left' : 'right';
    const [from, to] = source.y <= target.y ? [source, target] : [target, source];
    return { edge, from, to, fromSide: side, toSide: side };
  }
  const [from, to] = source.hop < target.hop ? [source, target] : [target, source];
  return { edge, from, to, fromSide: 'right', toSide: 'left' };
}

export function placeEdges(
  lines: Line[],
  offsets: Map<string, number>,
  edges: GraphEdge[],
  hops: Map<string, number>,
  rowGap: number,
): PlacedEdge[] {
  const chain = findStrongestChain(edges, hops);
  const weights = edges.map((edge) => edge.weight);
  const takenLabelSpots = new Set<string>();
  return lines
    .toSorted((a, b) => b.edge.weight - a.edge.weight)
    .map((line, index) => {
      const { edge, from, to, fromSide } = line;
      const start = { x: from.x, y: from.y + (offsets.get(portKey(line, 'from')) ?? 0) };
      const end = { x: to.x, y: to.y + (offsets.get(portKey(line, 'to')) ?? 0) };
      const isAcross = from.x !== to.x;
      const points = isAcross
        ? routeAcrossColumns(start, end)
        : routeWithinColumn(start, end, fromSide, rowGap);
      const lineWidth = scale(edge.weight, weights, MIN_LINE_WIDTH, MAX_LINE_WIDTH);
      return {
        ...edge,
        id: `edge-${index}`,
        path: toRoundedPath(points),
        lineWidth,
        isInStrongestChain: chain.has(edge),
        readsForward: edge.source === from.name,
        hop: from.hop,
        midX: (from.x + to.x) / 2,
        label: isAcross
          ? findLabelSpot(edge.relations[0] ?? '', points, from, to, lineWidth, takenLabelSpots)
          : null,
      };
    });
}
