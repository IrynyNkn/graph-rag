import type { Panel } from './flow/grid';
import type { FlowLayout, PlacedEdge, PlacedNode } from './flow/layout';
import type { Point } from './flow/routing';

export const CARD_WIDTH = 284;
const CARD_MARGIN = 14;
// The legend runs along the bottom of the panel.
const CARD_MARGIN_BOTTOM = 42;
// Rows leave room above a chip for one line of text.
const LABEL_LIFT = 19;

export type GraphFocus = { kind: 'node'; node: PlacedNode } | { kind: 'edge'; edge: PlacedEdge };

/** What lights up part of the graph: something in it, or a source of the answer beside it. */
export type GraphHighlight = GraphFocus | { kind: 'source'; chunkId: string };

export interface RelationLabel extends Point {
  id: string;
  text: string;
  /** On the middle of its line, rather than from the top left of the chip it belongs to. */
  isCentred: boolean;
}

export function edgeIsLit(highlight: GraphHighlight, edge: PlacedEdge): boolean {
  switch (highlight.kind) {
    case 'edge':
      return highlight.edge === edge;
    case 'node':
      return edge.source === highlight.node.name || edge.target === highlight.node.name;
    case 'source':
      return edge.chunkIds.includes(highlight.chunkId);
  }
}

/** A source that gave this graph no relation has nothing to light up, and must not dim the rest. */
export function findSourceHighlight(
  chunkId: string | null,
  layout: FlowLayout,
): GraphHighlight | null {
  if (chunkId === null) {
    return null;
  }
  const highlight: GraphHighlight = { kind: 'source', chunkId };
  return layout.edges.some((edge) => edgeIsLit(highlight, edge)) ? highlight : null;
}

/** A hovered node keeps its neighbours readable, because they are what the hover is asking about. */
export function findLitNodes(highlight: GraphHighlight, edges: PlacedEdge[]): Set<string> {
  if (highlight.kind === 'edge') {
    return new Set([highlight.edge.source, highlight.edge.target]);
  }
  const linked = edges
    .filter((edge) => edgeIsLit(highlight, edge))
    .flatMap((edge) => [edge.source, edge.target]);
  return new Set(highlight.kind === 'node' ? [highlight.node.name, ...linked] : linked);
}

export function isStillDrawn(focus: GraphFocus, layout: FlowLayout): boolean {
  return focus.kind === 'node'
    ? layout.nodes.includes(focus.node)
    : layout.edges.includes(focus.edge);
}

/**
 * A line of a fan is only apart from the others near its far end, so a hovered node labels its
 * relations above its neighbours. Rows are far enough apart that these labels never collide.
 */
export function findRelationLabels(focus: GraphFocus, layout: FlowLayout): RelationLabel[] {
  if (focus.kind === 'edge') {
    const { edge } = focus;
    const text = describeRelation(edge);
    return [{ id: edge.id, text, x: edge.midX, y: edge.midY, isCentred: true }];
  }
  const byName = new Map(layout.nodes.map((node) => [node.name, node]));
  return layout.edges
    .filter((edge) => edgeIsLit(focus, edge))
    .flatMap((edge) => {
      const other = byName.get(edge.source === focus.node.name ? edge.target : edge.source);
      if (other === undefined) {
        return [];
      }
      const y = other.y - other.height / 2 - LABEL_LIFT;
      return [{ id: edge.id, text: describeRelation(edge), x: other.x, y, isCentred: false }];
    });
}

function describeRelation(edge: PlacedEdge): string {
  const relation = edge.relations[0] ?? '';
  return edge.readsForward ? `${relation} →` : `← ${relation}`;
}

/** The corner that covers the fewest of the lit chips, and of those the nearest to the focus. */
export function placeCard(
  focus: GraphFocus,
  layout: FlowLayout,
  panel: Panel,
  cardHeight: number,
): Point {
  const lit = findLitNodes(focus, layout.edges);
  const chips = layout.nodes.filter((node) => lit.has(node.name));
  const anchor = findAnchor(focus, layout.scale);
  const corners = findCorners(panel, cardHeight);
  const scored = corners.map((corner) => ({
    corner,
    covered: chips.filter((node) => coversChip(corner, cardHeight, node, layout.scale)).length,
    distance: Math.hypot(
      corner.x + CARD_WIDTH / 2 - anchor.x,
      corner.y + cardHeight / 2 - anchor.y,
    ),
  }));
  const [best] = scored.toSorted((a, b) => a.covered - b.covered || a.distance - b.distance);
  return best?.corner ?? { x: CARD_MARGIN, y: CARD_MARGIN };
}

function findCorners(panel: Panel, cardHeight: number): Point[] {
  const right = Math.max(CARD_MARGIN, panel.width - CARD_WIDTH - CARD_MARGIN);
  const bottom = Math.max(CARD_MARGIN, panel.height - cardHeight - CARD_MARGIN_BOTTOM);
  return [
    { x: right, y: bottom },
    { x: right, y: CARD_MARGIN },
    { x: CARD_MARGIN, y: bottom },
    { x: CARD_MARGIN, y: CARD_MARGIN },
  ];
}

function coversChip(corner: Point, cardHeight: number, node: PlacedNode, scale: number): boolean {
  const left = node.x * scale;
  const right = (node.x + node.width) * scale;
  const top = (node.y - node.height / 2) * scale;
  const bottom = (node.y + node.height / 2) * scale;
  return (
    left < corner.x + CARD_WIDTH &&
    right > corner.x &&
    top < corner.y + cardHeight &&
    bottom > corner.y
  );
}

function findAnchor(focus: GraphFocus, scale: number): Point {
  return focus.kind === 'node'
    ? { x: (focus.node.x + focus.node.width / 2) * scale, y: focus.node.y * scale }
    : { x: focus.edge.midX * scale, y: focus.edge.midY * scale };
}
