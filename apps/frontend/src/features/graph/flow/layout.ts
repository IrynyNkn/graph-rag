import type { GraphEdge, GraphNode, RetrievedGraph } from '@graph-rag/contracts';
import { measureChip, type Chip } from './chips';
import { assignHops, assignRows, findNeighbours, orderColumns } from './columns';
import { findLines, placeEdges } from './edges';
import { fitGrid, type Grid, type Panel } from './grid';
import type { Point } from './routing';
import { findStrongestChain } from './strongest-chain';

export interface PlacedNode extends GraphNode, Point, Chip {
  /** `x` is the left edge of the chip and `y` its middle. */
  hop: number;
  /** Activation on a root scale up to 1, because a few nodes take most of the activation. */
  strength: number;
  isOnStrongestPath: boolean;
}

export interface PlacedEdge extends GraphEdge {
  /** Stays the same between graphs, so that an edge both of them have can move, not reappear. */
  id: string;
  /** SVG path data, always running from the earlier hop to the later one. */
  path: string;
  lineWidth: number;
  /** Weight relative to the heaviest edge. */
  strength: number;
  isInStrongestChain: boolean;
  /** Whether the relation reads along the path, from its start to its end. */
  readsForward: boolean;
  hop: number;
  midX: number;
  midY: number;
}

export interface FlowColumn {
  hop: number;
  x: number;
}

export interface FlowLayout extends Panel {
  /** Width and height are in layout units, and this is how much smaller they are drawn. */
  scale: number;
  nodes: PlacedNode[];
  /** Strongest first. */
  edges: PlacedEdge[];
  columns: FlowColumn[];
  /** Where the first row is, for the line of column labels above it. */
  top: number;
}

export const EMPTY_LAYOUT: FlowLayout = {
  scale: 1,
  width: 0,
  height: 0,
  nodes: [],
  edges: [],
  columns: [],
  top: 0,
};

/**
 * Lays the graph out as a flow from left to right: a seed in the first column and each next column
 * one hop further. Unlike a force layout it is deterministic, so an answer always gets the same
 * picture, and chips stay apart, which is what makes the graph readable.
 */
export function layoutFlow(graph: RetrievedGraph, panel: Panel): FlowLayout {
  const neighbours = findNeighbours(graph);
  const hops = assignHops(graph.nodes, neighbours);
  const names = orderColumns(graph.nodes, hops, neighbours);
  const rows = assignRows(names, neighbours);
  const chips = new Map(graph.nodes.map((node) => [node.name, measureChip(node.name)]));
  const widths = names.map((column) => widestChip(column, chips));
  const grid = fitGrid(widths, Math.max(0, ...rows.values()), panel);
  const columnsX = placeColumns(widths, grid);
  const chain = findStrongestChain(graph.edges, hops);
  const onPath = new Set([...chain].flatMap((edge) => [edge.source, edge.target]));
  const strongest = Math.max(...graph.nodes.map((node) => node.activation), Number.MIN_VALUE);
  const nodes = graph.nodes.map((node): PlacedNode => {
    const hop = hops.get(node.name) ?? 0;
    return {
      ...node,
      ...(chips.get(node.name) ?? measureChip(node.name)),
      x: columnsX[hop] ?? grid.left,
      y: grid.top + (rows.get(node.name) ?? 0) * grid.rowGap,
      hop,
      strength: Math.sqrt(node.activation / strongest),
      isOnStrongestPath: onPath.has(node.name),
    };
  });
  return {
    scale: grid.scale,
    width: grid.width,
    height: grid.height,
    top: grid.top,
    nodes,
    edges: placeEdges(findLines(graph.edges, nodes), graph.edges, chain, grid.rowGap),
    columns: columnsX.map((x, hop) => ({ hop, x })),
  };
}

function widestChip(column: string[], chips: Map<string, Chip>): number {
  return Math.max(0, ...column.map((name) => chips.get(name)?.width ?? 0));
}

function placeColumns(widths: number[], grid: Grid): number[] {
  let x = grid.left;
  return widths.map((width) => {
    const here = x;
    x += width + grid.curveGap;
    return here;
  });
}
