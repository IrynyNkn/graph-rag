import type { GraphFocus } from './GraphFocusCard';
import type { PlacedEdge, SchematicLayout } from './schematic/layout';

const LABEL_CHARS_PER_LINE = 22;
// The row gap has room for this many. The full name shows on hover.
const LABEL_MAX_LINES = 2;

export function edgeIsLit(focus: GraphFocus, edge: PlacedEdge): boolean {
  return focus.kind === 'edge'
    ? focus.edge === edge
    : edge.source === focus.node.name || edge.target === focus.node.name;
}

/** A hovered stop keeps its neighbours readable, because they are what the hover is asking about. */
export function findLitNodes(focus: GraphFocus, edges: PlacedEdge[]): Set<string> {
  if (focus.kind === 'edge') {
    return new Set([focus.edge.source, focus.edge.target]);
  }
  const linked = edges
    .filter((edge) => edgeIsLit(focus, edge))
    .flatMap((edge) => [edge.source, edge.target]);
  return new Set([focus.node.name, ...linked]);
}

export function isStillDrawn(focus: GraphFocus, layout: SchematicLayout): boolean {
  return focus.kind === 'node'
    ? layout.nodes.includes(focus.node)
    : layout.edges.includes(focus.edge);
}

/** The card goes to the far side, so that it never covers what it describes. */
export function findCardSide(focus: GraphFocus, panelWidth: number): 'left' | 'right' {
  const x = focus.kind === 'node' ? focus.node.x : focus.edge.midX;
  return x > panelWidth / 2 ? 'left' : 'right';
}

export function wrapNodeLabel(name: string): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of name.split(' ')) {
    if (current.length > 0 && current.length + word.length + 1 > LABEL_CHARS_PER_LINE) {
      lines.push(current);
      current = word;
    } else {
      current = current.length > 0 ? `${current} ${word}` : word;
    }
  }
  lines.push(current);
  if (lines.length <= LABEL_MAX_LINES) {
    return lines;
  }
  return lines.slice(0, LABEL_MAX_LINES).map((line, index) => {
    return index === LABEL_MAX_LINES - 1 ? `${line}…` : line;
  });
}
