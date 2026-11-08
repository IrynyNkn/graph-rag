import type { GraphEdge, GraphNode, RetrievedGraph } from '@graph-rag/contracts';
import { describe, expect, it } from 'vitest';
import { layoutFlow, type FlowLayout } from './layout';

const PANEL = { width: 900, height: 800 };

const node = (name: string, activation = 1, isSeed = false): GraphNode => ({
  name,
  type: 'TEAM',
  description: null,
  activation,
  isSeed,
});

const edge = (source: string, target: string, weight = 1, relation = 'owns'): GraphEdge => ({
  source,
  target,
  relations: [relation],
  chunkIds: ['c1'],
  weight,
});

function placed(layout: FlowLayout, name: string) {
  const found = layout.nodes.find((item) => item.name === name);
  if (found === undefined) {
    throw new Error(`No node ${name}`);
  }
  return found;
}

function edgeBetween(layout: FlowLayout, source: string, target: string) {
  const found = layout.edges.find((item) => item.source === source && item.target === target);
  if (found === undefined) {
    throw new Error(`No edge ${source} > ${target}`);
  }
  return found;
}

const fanOf = (count: number): RetrievedGraph => ({
  nodes: [node('hub', 3, true), ...Array.from({ length: count }, (_, i) => node(`n${i}`))],
  edges: Array.from({ length: count }, (_, i) => edge('hub', `n${i}`)),
});

describe('layoutFlow', () => {
  const chain: RetrievedGraph = {
    nodes: [node('alice', 1, true), node('team', 2), node('billing', 0.5)],
    edges: [edge('alice', 'team', 2, 'manages'), edge('team', 'billing', 1)],
  };

  it('puts each hop from the seed one column further', () => {
    const layout = layoutFlow(chain, PANEL);

    expect(placed(layout, 'alice').hop).toBe(0);
    expect(placed(layout, 'team').hop).toBe(1);
    expect(placed(layout, 'billing').hop).toBe(2);
    expect(placed(layout, 'alice').x).toBeLessThan(placed(layout, 'team').x);
    expect(placed(layout, 'team').x).toBeLessThan(placed(layout, 'billing').x);
  });

  it('gives a column room for its widest chip', () => {
    const layout = layoutFlow(
      {
        nodes: [node('a very long entity name', 1, true), node('b')],
        edges: [edge('b', 'a very long entity name')],
      },
      PANEL,
    );
    const first = placed(layout, 'a very long entity name');

    expect(placed(layout, 'b').x).toBeGreaterThan(first.x + first.width);
  });

  it('describes its columns, for their labels', () => {
    const layout = layoutFlow(chain, PANEL);

    expect(layout.columns.map((column) => column.hop)).toEqual([0, 1, 2]);
    expect(layout.columns[1]?.x).toBe(placed(layout, 'team').x);
  });

  it('lines a chain up on one row, because straight lines read best', () => {
    const layout = layoutFlow(chain, PANEL);

    expect(placed(layout, 'team').y).toBe(placed(layout, 'alice').y);
    expect(placed(layout, 'billing').y).toBe(placed(layout, 'alice').y);
  });

  it('starts from the strongest seed and puts another seed where its distance falls', () => {
    const layout = layoutFlow(
      {
        nodes: [node('weak', 1, true), node('strong', 3, true)],
        edges: [edge('weak', 'strong')],
      },
      PANEL,
    );

    expect(placed(layout, 'strong').hop).toBe(0);
    expect(placed(layout, 'weak').hop).toBe(1);
  });

  it('starts a part of the graph without a seed from its strongest node', () => {
    const layout = layoutFlow(
      {
        nodes: [node('seed', 1, true), node('small', 1), node('big', 2)],
        edges: [edge('small', 'big')],
      },
      PANEL,
    );

    expect(placed(layout, 'big').hop).toBe(0);
    expect(placed(layout, 'small').hop).toBe(1);
  });

  it('rates nodes by activation on a root scale, and lines by weight', () => {
    const layout = layoutFlow(chain, PANEL);

    expect(placed(layout, 'team').strength).toBe(1);
    expect(placed(layout, 'billing').strength).toBe(0.5);
    expect(edgeBetween(layout, 'alice', 'team').strength).toBe(1);
    expect(edgeBetween(layout, 'team', 'billing').strength).toBe(0.5);
    expect(edgeBetween(layout, 'alice', 'team').lineWidth).toBeGreaterThan(
      edgeBetween(layout, 'team', 'billing').lineWidth,
    );
  });

  it('returns edges strongest first', () => {
    const layout = layoutFlow(chain, PANEL);

    expect(layout.edges.map((item) => item.weight)).toEqual([2, 1]);
  });

  it('is deterministic, so an answer always gets the same picture', () => {
    const graph: RetrievedGraph = {
      nodes: [node('a', 1, true), node('b'), node('c'), node('d')],
      edges: [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')],
    };

    expect(layoutFlow(graph, PANEL)).toEqual(layoutFlow(graph, PANEL));
  });

  it('keeps nodes of one column apart', () => {
    const layout = layoutFlow(fanOf(3), PANEL);

    const heights = ['n0', 'n1', 'n2'].map((name) => placed(layout, name).y);
    expect(new Set(heights).size).toBe(3);
    expect(placed(layout, 'n0').x).toBe(placed(layout, 'n1').x);
  });

  it('reads a relation forward or backward by its direction', () => {
    const layout = layoutFlow(
      {
        nodes: [node('seed', 2, true), node('member')],
        edges: [edge('member', 'seed', 1, 'member of')],
      },
      PANEL,
    );

    expect(edgeBetween(layout, 'member', 'seed').readsForward).toBe(false);
  });

  it('marks the way with the most total weight as the strongest path', () => {
    const layout = layoutFlow(
      {
        nodes: [node('a', 2, true), node('dead end'), node('c'), node('d')],
        edges: [edge('a', 'dead end', 3), edge('a', 'c', 2), edge('c', 'd', 2)],
      },
      PANEL,
    );

    const strongest = layout.edges.filter((item) => item.isInStrongestChain).map((item) => item.id);
    expect(strongest.toSorted()).toEqual(['a>c', 'c>d']);
    expect(placed(layout, 'd').isOnStrongestPath).toBe(true);
    expect(placed(layout, 'dead end').isOnStrongestPath).toBe(false);
  });

  it('names an edge by its ends, so that two graphs can share it', () => {
    expect(layoutFlow(chain, PANEL).edges[0]?.id).toBe('alice>team');
  });

  it('draws every line with the same commands, so that one can morph into another', () => {
    const layout = layoutFlow(
      {
        nodes: [node('hub', 3, true), node('a'), node('b')],
        edges: [edge('hub', 'a'), edge('hub', 'b'), edge('a', 'b', 1, 'knows')],
      },
      PANEL,
    );

    for (const item of layout.edges) {
      expect(item.path).toMatch(/^M \S+ \S+ C \S+ \S+ \S+ \S+ \S+ \S+$/);
    }
  });

  it('bows an edge within a column out to its right, and keeps it off the strongest path', () => {
    const layout = layoutFlow(
      {
        nodes: [node('hub', 3, true), node('a'), node('b')],
        edges: [edge('hub', 'a'), edge('hub', 'b'), edge('a', 'b', 9, 'knows')],
      },
      PANEL,
    );

    const arc = edgeBetween(layout, 'a', 'b');
    expect(placed(layout, 'a').x).toBe(placed(layout, 'b').x);
    expect(arc.midX).toBeGreaterThan(placed(layout, 'a').x + placed(layout, 'a').exitOffset);
    expect(arc.isInStrongestChain).toBe(false);
  });

  it('separates lines leaving one chip into ports', () => {
    const layout = layoutFlow(fanOf(2), PANEL);

    const startOf = (path: string) => path.split(' ').slice(1, 3).join(' ');
    expect(startOf(edgeBetween(layout, 'hub', 'n0').path)).not.toBe(
      startOf(edgeBetween(layout, 'hub', 'n1').path),
    );
  });

  it('keeps the ports of a busy chip within its height', () => {
    const layout = layoutFlow(fanOf(30), PANEL);
    const hub = placed(layout, 'hub');

    const starts = layout.edges.map((item) => Number(item.path.split(' ')[2]));
    expect(Math.max(...starts) - Math.min(...starts)).toBeLessThanOrEqual(hub.height);
  });

  describe('fitting the panel', () => {
    const rowGapOf = (layout: FlowLayout) => {
      const rows = [...new Set(layout.nodes.map((item) => item.y))].toSorted((a, b) => a - b);
      return (rows[1] ?? 0) - (rows[0] ?? 0);
    };

    it('draws at full size while the rows only have to tighten up', () => {
      const layout = layoutFlow(fanOf(5), { width: 900, height: 440 });

      expect(layout.scale).toBe(1);
      expect(rowGapOf(layout)).toBe(80);
      expect(layout.height).toBe(440);
    });

    it('draws a dense graph smaller, so that it fits without scrolling', () => {
      const layout = layoutFlow(fanOf(12), { width: 900, height: 600 });

      expect(layout.scale).toBeLessThan(1);
      expect(layout.height * layout.scale).toBeCloseTo(600);
      expect(layout.width * layout.scale).toBeCloseTo(900);
      expect(rowGapOf(layout)).toBeCloseTo(54);
    });

    it('scrolls rather than drawing the labels too small to read', () => {
      const layout = layoutFlow(fanOf(30), { width: 900, height: 500 });

      expect(layout.scale).toBe(0.7);
      expect(layout.height * layout.scale).toBeGreaterThan(500);
    });

    it('keeps columns apart on a narrow panel, which then scrolls', () => {
      const names = ['first service', 'second service', 'third service', 'fourth service'].flatMap(
        (name) => [`${name} one`, `${name} two`],
      );
      const layout = layoutFlow(
        {
          nodes: names.map((name, index) => node(name, 1, index === 0)),
          edges: names.slice(1).map((name, index) => edge(names[index] ?? '', name)),
        },
        { width: 500, height: 800 },
      );
      const first = placed(layout, names[0] ?? '');
      const second = placed(layout, names[1] ?? '');

      expect(second.x - first.x).toBeCloseTo(first.width + 36);
      expect(layout.width * layout.scale).toBeGreaterThan(500);
      expect(placed(layout, names.at(-1) ?? '').x).toBeLessThan(layout.width);
    });

    it('centers what is smaller than the panel', () => {
      const layout = layoutFlow({ nodes: [node('only', 1, true)], edges: [] }, PANEL);
      const only = placed(layout, 'only');

      expect(only.x + only.width / 2).toBeCloseTo(PANEL.width / 2);
      expect(only.y).toBeCloseTo(PANEL.height / 2);
    });
  });

  it('handles an empty graph', () => {
    expect(layoutFlow({ nodes: [], edges: [] }, PANEL)).toMatchObject({ nodes: [], edges: [] });
  });

  it('handles nodes without any activation', () => {
    const layout = layoutFlow({ nodes: [node('a', 0, true), node('b', 0)], edges: [] }, PANEL);

    expect(placed(layout, 'a').strength).toBe(0);
  });

  it('skips an edge to a node that is not in the graph', () => {
    const layout = layoutFlow(
      { nodes: [node('a', 1, true)], edges: [edge('a', 'missing')] },
      PANEL,
    );

    expect(layout.edges).toEqual([]);
  });
});
