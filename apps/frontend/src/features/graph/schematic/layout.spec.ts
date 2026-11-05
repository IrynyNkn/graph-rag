import type { GraphEdge, GraphNode, RetrievedGraph } from '@graph-rag/contracts';
import { describe, expect, it } from 'vitest';
import { layoutSchematic, type SchematicLayout } from './layout';

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

function placed(layout: SchematicLayout, name: string) {
  const found = layout.nodes.find((item) => item.name === name);
  if (found === undefined) {
    throw new Error(`No node ${name}`);
  }
  return found;
}

function edgeBetween(layout: SchematicLayout, source: string, target: string) {
  const found = layout.edges.find((item) => item.source === source && item.target === target);
  if (found === undefined) {
    throw new Error(`No edge ${source} > ${target}`);
  }
  return found;
}

describe('layoutSchematic', () => {
  const chain: RetrievedGraph = {
    nodes: [node('alice', 1, true), node('team', 2), node('billing', 0.5)],
    edges: [edge('alice', 'team', 2, 'manages'), edge('team', 'billing', 1)],
  };

  it('puts each hop from the seed one column further', () => {
    const layout = layoutSchematic(chain, PANEL);

    expect(placed(layout, 'alice').hop).toBe(0);
    expect(placed(layout, 'team').hop).toBe(1);
    expect(placed(layout, 'billing').hop).toBe(2);
    expect(placed(layout, 'alice').x).toBeLessThan(placed(layout, 'team').x);
    expect(placed(layout, 'team').x).toBeLessThan(placed(layout, 'billing').x);
  });

  it('lines a chain up on one row, because straight lines read best', () => {
    const layout = layoutSchematic(chain, PANEL);

    expect(placed(layout, 'team').y).toBe(placed(layout, 'alice').y);
    expect(placed(layout, 'billing').y).toBe(placed(layout, 'alice').y);
  });

  it('starts from the strongest seed and puts another seed where its distance falls', () => {
    const layout = layoutSchematic(
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
    const layout = layoutSchematic(
      {
        nodes: [node('seed', 1, true), node('small', 1), node('big', 2)],
        edges: [edge('small', 'big')],
      },
      PANEL,
    );

    expect(placed(layout, 'big').hop).toBe(0);
    expect(placed(layout, 'small').hop).toBe(1);
  });

  it('sizes nodes by activation and lines by weight', () => {
    const layout = layoutSchematic(chain, PANEL);

    expect(placed(layout, 'team').radius).toBeGreaterThan(placed(layout, 'billing').radius);
    expect(edgeBetween(layout, 'alice', 'team').lineWidth).toBeGreaterThan(
      edgeBetween(layout, 'team', 'billing').lineWidth,
    );
  });

  it('returns edges strongest first', () => {
    const layout = layoutSchematic(chain, PANEL);

    expect(layout.edges.map((item) => item.weight)).toEqual([2, 1]);
  });

  it('is deterministic, so an answer always gets the same picture', () => {
    const graph: RetrievedGraph = {
      nodes: [node('a', 1, true), node('b'), node('c'), node('d')],
      edges: [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')],
    };

    expect(layoutSchematic(graph, PANEL)).toEqual(layoutSchematic(graph, PANEL));
  });

  it('keeps nodes of one column apart', () => {
    const layout = layoutSchematic(
      {
        nodes: [node('hub', 2, true), node('a'), node('b'), node('c')],
        edges: [edge('hub', 'a'), edge('hub', 'b'), edge('hub', 'c')],
      },
      PANEL,
    );

    const heights = ['a', 'b', 'c'].map((name) => placed(layout, name).y);
    expect(new Set(heights).size).toBe(3);
    expect(placed(layout, 'a').x).toBe(placed(layout, 'b').x);
  });

  it('reads a relation forward or backward by its direction', () => {
    const layout = layoutSchematic(
      {
        nodes: [node('seed', 2, true), node('member')],
        edges: [edge('member', 'seed', 1, 'member of')],
      },
      PANEL,
    );

    expect(edgeBetween(layout, 'member', 'seed').readsForward).toBe(false);
  });

  it('marks the heaviest way through the graph as the strongest chain', () => {
    const layout = layoutSchematic(
      {
        nodes: [node('a', 2, true), node('b'), node('c'), node('d'), node('e')],
        edges: [edge('a', 'b', 3), edge('a', 'c', 1), edge('b', 'd', 1), edge('b', 'e', 2)],
      },
      PANEL,
    );

    const strongest = layout.edges
      .filter((item) => item.isInStrongestChain)
      .map((item) => `${item.source}>${item.target}`);
    expect(strongest.toSorted()).toEqual(['a>b', 'b>e']);
  });

  it('labels an edge above a straight run, and only once per node side', () => {
    const layout = layoutSchematic(
      {
        nodes: [node('a', 2, true), node('b', 1, true), node('c')],
        edges: [edge('a', 'c', 2, 'owns'), edge('b', 'c', 1, 'uses')],
      },
      PANEL,
    );

    const strong = edgeBetween(layout, 'a', 'c');
    expect(strong.label).toMatchObject({ anchor: 'end' });
    expect(strong.label?.x).toBeLessThan(placed(layout, 'c').x);
    expect(strong.label?.y).toBeLessThan(placed(layout, 'c').y + 10);
  });

  it('labels a node on the side that fewer of its lines head towards', () => {
    const layout = layoutSchematic(
      {
        nodes: [node('hub', 3, true), node('a'), node('b'), node('c')],
        edges: [edge('hub', 'a'), edge('hub', 'b'), edge('hub', 'c')],
      },
      PANEL,
    );

    const [upper, middle, lower] = layout.nodes
      .filter((item) => item.name !== 'hub')
      .toSorted((one, other) => one.y - other.y);
    expect(upper?.labelAbove).toBe(true);
    expect(middle?.labelAbove).toBe(false);
    expect(lower?.labelAbove).toBe(false);
  });

  it('puts the label of an edge on the side of the line away from the label of its node', () => {
    const layout = layoutSchematic(
      {
        nodes: [node('hub', 3, true), node('a'), node('b'), node('c')],
        edges: [edge('hub', 'a'), edge('hub', 'b'), edge('hub', 'c')],
      },
      { width: 1200, height: 800 },
    );

    const labelOf = (item: SchematicLayout['nodes'][number]) =>
      layout.edges.find((line) => line.target === item.name)?.label;
    const [upper, , lower] = layout.nodes
      .filter((item) => item.name !== 'hub')
      .toSorted((one, other) => one.y - other.y);
    expect(upper && labelOf(upper)?.y).toBeGreaterThan(upper?.y ?? 0);
    expect(lower && labelOf(lower)?.y).toBeLessThan(lower?.y ?? 0);
  });

  it('leaves out a label that has no room', () => {
    const layout = layoutSchematic(
      {
        nodes: [node('a', 2, true), node('b')],
        edges: [edge('a', 'b', 1, 'x'.repeat(90))],
      },
      PANEL,
    );

    expect(edgeBetween(layout, 'a', 'b').label).toBeNull();
  });

  it('draws an edge within a column as an arc and leaves it unlabelled', () => {
    const layout = layoutSchematic(
      {
        nodes: [node('hub', 3, true), node('a'), node('b')],
        edges: [edge('hub', 'a'), edge('hub', 'b'), edge('a', 'b', 1, 'knows')],
      },
      PANEL,
    );

    const arc = edgeBetween(layout, 'a', 'b');
    expect(placed(layout, 'a').x).toBe(placed(layout, 'b').x);
    expect(arc.label).toBeNull();
    expect(arc.path.match(/Q/g)?.length).toBe(4);
  });

  it('separates lines arriving at one node into ports', () => {
    const layout = layoutSchematic(
      {
        nodes: [node('hub', 3, true), node('a'), node('b')],
        edges: [edge('hub', 'a'), edge('hub', 'b')],
      },
      PANEL,
    );

    const startOf = (path: string) => path.split(' ').slice(1, 3).join(' ');
    expect(startOf(edgeBetween(layout, 'hub', 'a').path)).not.toBe(
      startOf(edgeBetween(layout, 'hub', 'b').path),
    );
  });

  it('keeps the circle of a stop that its lines fit into', () => {
    const layout = layoutSchematic(
      {
        nodes: [node('hub', 3, true), node('a'), node('b')],
        edges: [edge('hub', 'a'), edge('hub', 'b')],
      },
      PANEL,
    );

    expect(placed(layout, 'hub').stretch).toBe(0);
  });

  it('stretches a stop into a capsule when many lines arrive at it', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const layout = layoutSchematic(
      {
        nodes: [node('hub', 3, true), ...names.map((name) => node(name))],
        edges: names.map((name) => edge('hub', name)),
      },
      PANEL,
    );

    expect(placed(layout, 'hub').stretch).toBeGreaterThan(0);
    expect(placed(layout, 'a').stretch).toBe(0);
  });

  it('keeps a capsule within its column by squeezing the lines together', () => {
    const names = Array.from({ length: 30 }, (_, index) => `n${index}`);
    const layout = layoutSchematic(
      {
        nodes: [node('hub', 3, true), ...names.map((name) => node(name))],
        edges: names.map((name) => edge('hub', name)),
      },
      PANEL,
    );

    expect(placed(layout, 'hub').stretch).toBeCloseTo(48);
  });

  it('routes a steep line through a vertical run', () => {
    const layout = layoutSchematic(
      {
        nodes: [node('hub', 3, true), ...['a', 'b', 'c', 'd', 'e', 'f'].map((name) => node(name))],
        edges: ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => edge('hub', name)),
      },
      { width: 420, height: 800 },
    );

    const corners = Math.max(...layout.edges.map((item) => item.path.match(/Q/g)?.length ?? 0));
    expect(corners).toBeGreaterThanOrEqual(4);
  });

  describe('fitting the panel', () => {
    const fanOf = (count: number): RetrievedGraph => ({
      nodes: [node('hub', 3, true), ...Array.from({ length: count }, (_, i) => node(`n${i}`))],
      edges: Array.from({ length: count }, (_, i) => edge('hub', `n${i}`)),
    });
    const rowGapOf = (layout: SchematicLayout) => {
      const rows = [...new Set(layout.nodes.map((item) => item.y))].toSorted((a, b) => a - b);
      return (rows[1] ?? 0) - (rows[0] ?? 0);
    };

    it('draws at full size while the rows only have to tighten up', () => {
      const layout = layoutSchematic(fanOf(5), { width: 900, height: 440 });

      expect(layout.scale).toBe(1);
      expect(rowGapOf(layout)).toBe(82);
      expect(layout.height).toBe(440);
    });

    it('draws a dense graph smaller, so that it fits without scrolling', () => {
      const layout = layoutSchematic(fanOf(10), { width: 900, height: 600 });

      expect(layout.scale).toBeLessThan(1);
      expect(layout.height * layout.scale).toBeCloseTo(600);
      expect(layout.width * layout.scale).toBeCloseTo(900);
      expect(rowGapOf(layout)).toBeCloseTo(76);
    });

    it('scrolls rather than drawing the labels too small to read', () => {
      const layout = layoutSchematic(fanOf(30), { width: 900, height: 500 });

      expect(layout.scale).toBe(0.7);
      expect(layout.height * layout.scale).toBeGreaterThan(500);
    });
  });

  it('keeps columns apart on a narrow panel, which then scrolls', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    const layout = layoutSchematic(
      {
        nodes: names.map((name, index) => node(name, 1, index === 0)),
        edges: names.slice(1).map((name, index) => edge(names[index] ?? '', name)),
      },
      { width: 500, height: 800 },
    );

    expect(placed(layout, 'b').x - placed(layout, 'a').x).toBe(170);
    expect(layout.width * layout.scale).toBeGreaterThan(500);
    expect(placed(layout, 'f').x).toBeLessThan(layout.width);
  });

  it('centers a single column', () => {
    const layout = layoutSchematic({ nodes: [node('only', 1, true)], edges: [] }, PANEL);

    expect(placed(layout, 'only').x).toBe(PANEL.width / 2);
  });

  it('handles an empty graph', () => {
    expect(layoutSchematic({ nodes: [], edges: [] }, PANEL)).toMatchObject({
      nodes: [],
      edges: [],
      height: PANEL.height,
    });
  });

  it('skips an edge to a node that is not in the graph', () => {
    const layout = layoutSchematic(
      { nodes: [node('a', 1, true)], edges: [edge('a', 'missing')] },
      PANEL,
    );

    expect(layout.edges).toEqual([]);
  });
});
