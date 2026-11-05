import type { GraphNode, RetrievedGraph } from '@graph-rag/contracts';

const ORDERING_SWEEPS = 4;

export type Neighbours = Map<string, string[]>;

export function findNeighbours({ nodes, edges }: RetrievedGraph): Neighbours {
  const neighbours: Neighbours = new Map(nodes.map((node) => [node.name, []]));
  for (const { source, target } of edges) {
    neighbours.get(source)?.push(target);
    neighbours.get(target)?.push(source);
  }
  return neighbours;
}

/**
 * Breadth-first from the strongest seed of each connected part of the graph. Other seeds in that
 * part land in the column of their distance, so that neighbours rarely share a column.
 */
export function assignHops(nodes: GraphNode[], neighbours: Neighbours): Map<string, number> {
  const hops = new Map<string, number>();
  const strongestSeedsFirst = nodes.toSorted(
    (a, b) => Number(b.isSeed) - Number(a.isSeed) || b.activation - a.activation,
  );
  for (const { name: start } of strongestSeedsFirst) {
    if (hops.has(start)) {
      continue;
    }
    hops.set(start, 0);
    const queue = [start];
    for (const name of queue) {
      for (const next of neighbours.get(name) ?? []) {
        if (!hops.has(next)) {
          hops.set(next, (hops.get(name) ?? 0) + 1);
          queue.push(next);
        }
      }
    }
  }
  return hops;
}

/** Barycenter sweeps, the classic way to reduce crossings in a layered drawing. */
export function orderColumns(
  nodes: GraphNode[],
  hops: Map<string, number>,
  neighbours: Neighbours,
): string[][] {
  const columnCount = Math.max(0, ...hops.values()) + 1;
  const columns: string[][] = Array.from({ length: columnCount }, () => []);
  for (const { name } of nodes.toSorted((a, b) => b.activation - a.activation)) {
    columns[hops.get(name) ?? 0]?.push(name);
  }
  for (let sweep = 0; sweep < ORDERING_SWEEPS; sweep += 1) {
    for (let index = 1; index < columnCount; index += 1) {
      sortByBarycenter(columns, index, index - 1, neighbours);
    }
    for (let index = columnCount - 2; index >= 0; index -= 1) {
      sortByBarycenter(columns, index, index + 1, neighbours);
    }
  }
  return columns;
}

function sortByBarycenter(
  columns: string[][],
  index: number,
  reference: number,
  neighbours: Neighbours,
): void {
  const order = new Map((columns[reference] ?? []).map((name, position) => [name, position]));
  const current = columns[index] ?? [];
  const positions = new Map(
    current.map((name, position) => {
      const linked = (neighbours.get(name) ?? []).flatMap((next) => {
        const found = order.get(next);
        return found === undefined ? [] : [found];
      });
      return [name, linked.length > 0 ? average(linked) : position] as const;
    }),
  );
  columns[index] = current.toSorted((a, b) => (positions.get(a) ?? 0) - (positions.get(b) ?? 0));
}

/** Rows line up with neighbours wherever they can, because straight lines read best. */
export function assignRows(columns: string[][], neighbours: Neighbours): Map<string, number> {
  const rows = new Map<string, number>();
  columns.forEach((column, index) => {
    placeColumn(column, rows, neighbours, index === 0);
  });
  for (let index = columns.length - 2; index >= 0; index -= 1) {
    pullTowardsNextColumn(columns[index] ?? [], columns[index + 1] ?? [], rows, neighbours);
  }
  return rows;
}

function placeColumn(
  column: string[],
  rows: Map<string, number>,
  neighbours: Neighbours,
  isFirst: boolean,
): void {
  let previous = -1;
  for (const name of column) {
    const placed = (neighbours.get(name) ?? []).flatMap((next) => {
      const row = rows.get(next);
      return row === undefined ? [] : [row];
    });
    const wanted = !isFirst && placed.length > 0 ? Math.round(average(placed)) : previous + 1;
    previous = Math.max(wanted, previous + 1);
    rows.set(name, previous);
  }
}

function pullTowardsNextColumn(
  column: string[],
  nextColumn: string[],
  rows: Map<string, number>,
  neighbours: Neighbours,
): void {
  const next = new Set(nextColumn);
  let below = Number.POSITIVE_INFINITY;
  for (const name of column.toReversed()) {
    const linked = (neighbours.get(name) ?? []).filter((other) => next.has(other));
    const current = rows.get(name) ?? 0;
    const wanted =
      linked.length > 0
        ? Math.round(average(linked.map((other) => rows.get(other) ?? 0)))
        : current;
    const row = Math.min(Math.max(wanted, current), below - 1);
    rows.set(name, row);
    below = row;
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
