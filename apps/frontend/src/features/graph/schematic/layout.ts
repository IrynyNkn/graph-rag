import type { GraphEdge, GraphNode, RetrievedGraph } from '@graph-rag/contracts';
import { assignHops, assignRows, findNeighbours, orderColumns } from './columns';
import type { EdgeLabel } from './edge-labels';
import { findLines, placeEdges } from './edges';
import { fitGrid, MARGIN_Y, type Grid, type Panel } from './grid';
import { findNodesLabelledAbove } from './node-labels';
import { assignPorts } from './ports';
import type { Point } from './routing';
import { scale } from './scale';

const MIN_RADIUS = 7;
const MAX_RADIUS = 18;

export interface PlacedNode extends GraphNode, Point {
  hop: number;
  radius: number;
  /** Extra height for a stop that many lines arrive at, which makes it a capsule. */
  stretch: number;
  labelAbove: boolean;
}

export interface PlacedEdge extends GraphEdge {
  id: string;
  /** SVG path data, always running from the earlier hop to the later one. */
  path: string;
  lineWidth: number;
  isInStrongestChain: boolean;
  /** Whether the relation reads along the path, from its start to its end. */
  readsForward: boolean;
  hop: number;
  midX: number;
  label: EdgeLabel | null;
}

export interface SchematicLayout extends Panel {
  /** Width and height are in layout units, and this is how much smaller they are drawn. */
  scale: number;
  nodes: PlacedNode[];
  /** Strongest first. */
  edges: PlacedEdge[];
}

/**
 * Lays the graph out like a transit diagram: a seed on the left, each column one hop further, and
 * lines made of straight runs. Unlike a force layout it is deterministic, so an answer always gets
 * the same picture, and it keeps labels apart, which is what makes the relations readable.
 */
export function layoutSchematic(graph: RetrievedGraph, panel: Panel): SchematicLayout {
  const neighbours = findNeighbours(graph);
  const hops = assignHops(graph.nodes, neighbours);
  const columns = orderColumns(graph.nodes, hops, neighbours);
  const rows = assignRows(columns, neighbours);
  const grid = fitGrid(columns.length - 1, Math.max(0, ...rows.values()), panel);
  const stops = placeStops(graph.nodes, positionNames(columns, rows, grid), hops);
  const stopLines = findLines(graph.edges, stops);
  const ports = assignPorts(stopLines);
  const labelledAbove = findNodesLabelledAbove(stopLines);
  const nodes = stops.map((stop) => ({
    ...stop,
    stretch: ports.stretches.get(stop.name) ?? 0,
    labelAbove: labelledAbove.has(stop.name),
  }));
  const lines = findLines(graph.edges, nodes);
  const lowest = Math.max(0, ...nodes.map((node) => node.y));
  return {
    scale: grid.scale,
    width: grid.width,
    height: Math.max(grid.height, lowest + MARGIN_Y),
    nodes,
    edges: placeEdges(lines, ports.offsets, graph.edges, hops, grid.rowGap),
  };
}

function positionNames(
  columns: string[][],
  rows: Map<string, number>,
  { width, height, rowGap, columnGap }: Grid,
): Map<string, Point> {
  const left = (width - columnGap * (columns.length - 1)) / 2;
  const contentHeight = Math.max(0, ...rows.values()) * rowGap;
  const top = Math.max(MARGIN_Y, (height - contentHeight) / 2 - MARGIN_Y / 2);
  const positions = new Map<string, Point>();
  columns.forEach((column, index) => {
    for (const name of column) {
      positions.set(name, {
        x: left + index * columnGap,
        y: top + (rows.get(name) ?? 0) * rowGap,
      });
    }
  });
  return positions;
}

function placeStops(
  nodes: GraphNode[],
  positions: Map<string, Point>,
  hops: Map<string, number>,
): PlacedNode[] {
  const activations = nodes.map((node) => node.activation);
  return nodes.map((node) => ({
    ...node,
    ...(positions.get(node.name) ?? { x: 0, y: 0 }),
    hop: hops.get(node.name) ?? 0,
    radius: scale(node.activation, activations, MIN_RADIUS, MAX_RADIUS),
    stretch: 0,
    labelAbove: false,
  }));
}
