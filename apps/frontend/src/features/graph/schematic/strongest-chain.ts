import type { GraphEdge } from '@graph-rag/contracts';

/** The greedy strongest chain from the first column: it takes the heaviest way on at each node. */
export function findStrongestChain(edges: GraphEdge[], hops: Map<string, number>): Set<GraphEdge> {
  const chain = new Set<GraphEdge>();
  const fromFirstColumn = edges.filter(
    (edge) => earlierHop(edge, hops) === 0 && hops.get(edge.source) !== hops.get(edge.target),
  );
  let next = strongestOf(fromFirstColumn);
  while (next !== undefined) {
    chain.add(next);
    const reached = laterEnd(next, hops);
    next = strongestOf(edges.filter((edge) => leaves(edge, reached, hops)));
  }
  return chain;
}

function strongestOf(edges: GraphEdge[]): GraphEdge | undefined {
  return edges.toSorted((a, b) => b.weight - a.weight)[0];
}

function earlierHop(edge: GraphEdge, hops: Map<string, number>): number {
  return Math.min(hops.get(edge.source) ?? 0, hops.get(edge.target) ?? 0);
}

function laterEnd(edge: GraphEdge, hops: Map<string, number>): string {
  return (hops.get(edge.source) ?? 0) > (hops.get(edge.target) ?? 0) ? edge.source : edge.target;
}

function leaves(edge: GraphEdge, name: string, hops: Map<string, number>): boolean {
  const other = edge.source === name ? edge.target : edge.target === name ? edge.source : null;
  return other !== null && (hops.get(other) ?? 0) > (hops.get(name) ?? 0);
}
