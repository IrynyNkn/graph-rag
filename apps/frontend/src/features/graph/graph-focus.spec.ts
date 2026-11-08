import type { RetrievedGraph } from '@graph-rag/contracts';
import { describe, expect, it } from 'vitest';
import { layoutFlow, type PlacedNode } from './flow/layout';
import {
  CARD_WIDTH,
  edgeIsLit,
  findLitNodes,
  findRelationLabels,
  isStillDrawn,
  placeCard,
  type GraphFocus,
} from './graph-focus';

const PANEL = { width: 900, height: 700 };

const graph: RetrievedGraph = {
  nodes: [
    { name: 'seed', type: null, description: null, activation: 2, isSeed: true },
    { name: 'middle', type: null, description: null, activation: 1, isSeed: false },
    { name: 'far', type: null, description: null, activation: 1, isSeed: false },
    { name: 'other', type: null, description: null, activation: 1, isSeed: false },
  ],
  edges: [
    { source: 'seed', target: 'middle', relations: ['owns'], chunkIds: [], weight: 2 },
    { source: 'far', target: 'middle', relations: ['part of'], chunkIds: [], weight: 1 },
    { source: 'seed', target: 'other', relations: ['uses'], chunkIds: [], weight: 1 },
  ],
};

const layout = layoutFlow(graph, PANEL);

function nodeFocus(name: string): GraphFocus {
  const node = layout.nodes.find((item) => item.name === name);
  if (node === undefined) {
    throw new Error(`No node ${name}`);
  }
  return { kind: 'node', node };
}

function edgeFocus(id: string): GraphFocus {
  const edge = layout.edges.find((item) => item.id === id);
  if (edge === undefined) {
    throw new Error(`No edge ${id}`);
  }
  return { kind: 'edge', edge };
}

describe('what a focus lights up', () => {
  it('lights a node with its neighbours and their edges', () => {
    const focus = nodeFocus('middle');

    expect(findLitNodes(focus, layout.edges)).toEqual(new Set(['middle', 'seed', 'far']));
    expect(layout.edges.filter((edge) => edgeIsLit(focus, edge)).map((edge) => edge.id)).toEqual([
      'seed>middle',
      'far>middle',
    ]);
  });

  it('lights an edge with its two ends', () => {
    const focus = edgeFocus('seed>other');

    expect(findLitNodes(focus, layout.edges)).toEqual(new Set(['seed', 'other']));
    expect(layout.edges.filter((edge) => edgeIsLit(focus, edge)).map((edge) => edge.id)).toEqual([
      'seed>other',
    ]);
  });

  it('knows when a new layout has replaced what it points at', () => {
    const newer = layoutFlow(graph, PANEL);

    expect(isStillDrawn(nodeFocus('seed'), layout)).toBe(true);
    expect(isStillDrawn(nodeFocus('seed'), newer)).toBe(false);
    expect(isStillDrawn(edgeFocus('seed>other'), layout)).toBe(true);
    expect(isStillDrawn(edgeFocus('seed>other'), newer)).toBe(false);
  });
});

describe('findRelationLabels', () => {
  it('labels the relations of a node above its neighbours', () => {
    const labels = findRelationLabels(nodeFocus('middle'), layout);
    const seed = layout.nodes.find((node) => node.name === 'seed');

    expect(labels.map((label) => label.text)).toEqual(['owns →', '← part of']);
    expect(labels[0]?.x).toBe(seed?.x);
    expect(labels[0]?.y).toBeLessThan((seed?.y ?? 0) - (seed?.height ?? 0) / 2);
    expect(labels[0]?.isCentred).toBe(false);
  });

  it('labels an edge on the middle of its line', () => {
    const focus = edgeFocus('seed>other');
    const edge = layout.edges.find((item) => item.id === 'seed>other');

    expect(findRelationLabels(focus, layout)).toEqual([
      { id: 'seed>other', text: 'uses →', x: edge?.midX, y: edge?.midY, isCentred: true },
    ]);
  });

  it('skips an edge whose other end has gone', () => {
    const focus = nodeFocus('middle');
    const partial = { ...layout, nodes: layout.nodes.filter((node) => node.name !== 'far') };

    expect(findRelationLabels(focus, partial).map((label) => label.text)).toEqual(['owns →']);
  });
});

describe('placeCard', () => {
  const LEFT = 14;
  const RIGHT = PANEL.width - CARD_WIDTH - 14;
  const TOP = 14;
  const bottomFor = (height: number) => PANEL.height - height - 42;

  it('takes the free corner nearest to what it describes', () => {
    const placed = placeCard(edgeFocus('seed>other'), layout, PANEL, 100);

    expect([LEFT, RIGHT]).toContain(placed.x);
    expect([TOP, bottomFor(100)]).toContain(placed.y);
  });

  it('never covers a lit chip when a corner is free of them', () => {
    const wide = { width: 1200, height: 400 };
    const spaced = layoutFlow(graph, wide);
    const seed = spaced.nodes.find((node) => node.name === 'seed') as PlacedNode;

    const { x, y } = placeCard({ kind: 'node', node: seed }, spaced, wide, 60);

    const overlaps =
      seed.x * spaced.scale < x + CARD_WIDTH &&
      (seed.x + seed.width) * spaced.scale > x &&
      (seed.y - seed.height / 2) * spaced.scale < y + 60 &&
      (seed.y + seed.height / 2) * spaced.scale > y;
    expect(overlaps).toBe(false);
  });

  it('prefers a corner that covers fewer lit chips over a nearer one', () => {
    const near = { ...layout.nodes[0], x: PANEL.width - 200, y: PANEL.height - 80 } as PlacedNode;
    const shifted = { ...layout, nodes: [near], edges: [] };

    const placed = placeCard({ kind: 'node', node: near }, shifted, PANEL, 100);

    expect(placed).toEqual({ x: RIGHT, y: TOP });
  });

  it('stays inside a panel too small for it', () => {
    const small = { width: 200, height: 100 };

    const placed = placeCard(nodeFocus('seed'), layout, small, 400);

    expect(placed.x).toBe(LEFT);
    expect(placed.y).toBe(TOP);
  });
});
