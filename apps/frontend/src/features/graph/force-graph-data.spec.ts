import { describe, expect, it } from 'vitest';
import { describeLink, describeNode, toForceGraphData } from './force-graph-data';

const node = (name: string, activation: number) => ({
  name,
  type: 'TEAM',
  description: `About ${name}.`,
  activation,
  isSeed: false,
});

const edge = (weight: number) => ({
  source: 'a',
  target: 'b',
  relations: ['owns', 'runs'],
  chunkIds: ['c'],
  weight,
});

describe('toForceGraphData', () => {
  it('sizes nodes by activation', () => {
    const { nodes } = toForceGraphData({ nodes: [node('a', 2), node('b', 1)], edges: [] });

    expect(nodes[0]?.radius).toBeGreaterThan(nodes[1]?.radius ?? 0);
    expect(nodes[0]?.id).toBe('a');
  });

  it('widens links by weight', () => {
    const { links } = toForceGraphData({
      nodes: [node('a', 1), node('b', 1)],
      edges: [edge(1), edge(0.25)],
    });

    expect(links[0]?.width).toBeGreaterThan(links[1]?.width ?? 0);
  });

  it('handles zero weights and an empty graph', () => {
    expect(toForceGraphData({ nodes: [], edges: [] })).toEqual({ nodes: [], links: [] });

    const { nodes } = toForceGraphData({ nodes: [node('a', 0)], edges: [] });
    expect(Number.isFinite(nodes[0]?.radius)).toBe(true);
  });
});

describe('labels', () => {
  const data = toForceGraphData({ nodes: [node('a', 1.26)], edges: [edge(0.5)] });

  it('describe a node with its activation', () => {
    expect(describeNode(data.nodes[0]!)).toBe('a (TEAM), activation 1.26\nAbout a.');
  });

  it('describe a node with nothing known', () => {
    expect(describeNode({ ...data.nodes[0]!, type: null, description: null })).toBe(
      'a, activation 1.26',
    );
  });

  it('describe a link with its relations and weight', () => {
    expect(describeLink(data.links[0]!)).toBe('owns, runs, weight 0.50');
  });
});
