import type { GraphEdge } from '@graph-rag/contracts';

interface BestWay {
  total: number;
  first: GraphEdge | null;
  next: string | null;
}

const DEAD_END: BestWay = { total: 0, first: null, next: null };

/** The way from the first column that adds up to the most weight, always going a column further. */
export function findStrongestChain(edges: GraphEdge[], hops: Map<string, number>): Set<GraphEdge> {
  const ways = new Map<string, BestWay>();
  const starts = [...hops.keys()].filter((name) => hops.get(name) === 0);
  const start = starts.toSorted(
    (a, b) => findBestWay(b, edges, hops, ways).total - findBestWay(a, edges, hops, ways).total,
  )[0];
  const chain = new Set<GraphEdge>();
  let way = start === undefined ? DEAD_END : findBestWay(start, edges, hops, ways);
  while (way.first !== null && way.next !== null) {
    chain.add(way.first);
    way = findBestWay(way.next, edges, hops, ways);
  }
  return chain;
}

function findBestWay(
  name: string,
  edges: GraphEdge[],
  hops: Map<string, number>,
  ways: Map<string, BestWay>,
): BestWay {
  const known = ways.get(name);
  if (known !== undefined) {
    return known;
  }
  let best = DEAD_END;
  for (const edge of edges) {
    const other = otherEnd(edge, name);
    if (other !== null && (hops.get(other) ?? 0) > (hops.get(name) ?? 0)) {
      const total = edge.weight + findBestWay(other, edges, hops, ways).total;
      if (total > best.total) {
        best = { total, first: edge, next: other };
      }
    }
  }
  ways.set(name, best);
  return best;
}

function otherEnd(edge: GraphEdge, name: string): string | null {
  if (edge.source === name) {
    return edge.target;
  }
  return edge.target === name ? edge.source : null;
}
