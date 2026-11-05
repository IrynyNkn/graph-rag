import type { RetrievedGraph } from '@graph-rag/contracts';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapNodeLabel } from './graph-focus';
import { GraphView } from './GraphView';

const graph: RetrievedGraph = {
  nodes: [
    {
      name: 'owen blackwood',
      type: 'PERSON',
      description: 'Manages the Search Team.',
      activation: 1.25,
      isSeed: true,
    },
    { name: 'search team', type: 'TEAM', description: null, activation: 0.5, isSeed: false },
    { name: 'search index', type: null, description: null, activation: 0.4, isSeed: false },
  ],
  edges: [
    {
      source: 'owen blackwood',
      target: 'search team',
      relations: ['manages', 'manages', 'leads'],
      chunkIds: ['c1'],
      weight: 0.8,
    },
    {
      source: 'search index',
      target: 'search team',
      relations: ['owned by'],
      chunkIds: ['c2'],
      weight: 0.5,
    },
  ],
};

describe('GraphView', () => {
  let resize: ResizeObserverCallback;

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderSized(value: RetrievedGraph | null) {
    const view = render(<GraphView graph={value} />);
    act(() => {
      resize(
        [{ contentRect: { width: 900, height: 700 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
    return view;
  }

  it('shows an invitation without a graph', () => {
    renderSized(null);

    expect(screen.getByText(/prints here/)).toBeTruthy();
  });

  it('shows an invitation for a graph with no nodes', () => {
    renderSized({ nodes: [], edges: [] });

    expect(screen.getByText(/prints here/)).toBeTruthy();
  });

  it('draws nodes with their names, edges with their relations, and a legend', () => {
    const { container } = renderSized(graph);

    expect(screen.getByText('owen blackwood')).toBeTruthy();
    expect(screen.getByText('manages →')).toBeTruthy();
    expect(screen.getByText('← owned by')).toBeTruthy();
    expect(container.querySelectorAll('.node')).toHaveLength(3);
    expect(container.querySelectorAll('.node.is-seed')).toHaveLength(1);
    expect(container.querySelectorAll('.edge')).toHaveLength(2);
    expect(screen.getByText('strongest path')).toBeTruthy();
  });

  it('explains a node on hover and dims what is not connected to it', () => {
    const { container } = renderSized(graph);
    const node = screen.getByText('owen blackwood').closest('.node') as Element;

    fireEvent.mouseEnter(node);

    expect(screen.getByText('Manages the Search Team.')).toBeTruthy();
    expect(screen.getByText('PERSON / activation 1.25')).toBeTruthy();
    expect(screen.getByText('search index').closest('.node')?.classList).toContain('is-dimmed');
    expect(screen.getByText('search team').closest('.node')?.classList).not.toContain('is-dimmed');
    expect(container.querySelectorAll('.edge.is-dimmed')).toHaveLength(1);

    fireEvent.mouseLeave(node);

    expect(screen.queryByText('Manages the Search Team.')).toBeNull();
    expect(container.querySelectorAll('.is-dimmed')).toHaveLength(0);
  });

  it('puts the card on the far side, so that it does not cover what it describes', () => {
    const { container } = renderSized(graph);

    fireEvent.mouseEnter(screen.getByText('owen blackwood').closest('.node') as Element);
    expect(container.querySelector('.graph-card')?.classList).toContain('is-right');

    fireEvent.mouseEnter(screen.getByText('search index').closest('.node') as Element);
    expect(container.querySelector('.graph-card')?.classList).toContain('is-left');
  });

  it('drops the card when the graph changes under a still pointer', () => {
    const { rerender } = renderSized(graph);
    fireEvent.mouseEnter(screen.getByText('owen blackwood').closest('.node') as Element);
    expect(screen.getByText('Manages the Search Team.')).toBeTruthy();

    rerender(<GraphView graph={{ ...graph, edges: [] }} />);

    expect(screen.queryByText('Manages the Search Team.')).toBeNull();
  });

  it('calls a node without a type an entity', () => {
    renderSized(graph);

    fireEvent.mouseEnter(screen.getByText('search index').closest('.node') as Element);

    expect(screen.getByText('entity / activation 0.40')).toBeTruthy();
  });

  it('explains an edge on hover with its unique relations', () => {
    const { container } = renderSized(graph);

    fireEvent.mouseEnter(screen.getByText('manages →').closest('.edge') as Element);

    expect(screen.getByText('manages, leads')).toBeTruthy();
    expect(screen.getByText('weight 0.80')).toBeTruthy();
    expect(container.querySelectorAll('.node.is-dimmed')).toHaveLength(1);
  });
});

describe('wrapNodeLabel', () => {
  it('keeps a short name on one line', () => {
    expect(wrapNodeLabel('search team')).toEqual(['search team']);
  });

  it('wraps a long name between words', () => {
    expect(wrapNodeLabel('platform engineering department')).toEqual([
      'platform engineering',
      'department',
    ]);
  });

  it('cuts what does not fit in two lines, because the card shows the full name', () => {
    expect(wrapNodeLabel('the quick brown fox jumps over the lazy dog again')).toEqual([
      'the quick brown fox',
      'jumps over the lazy…',
    ]);
  });
});
