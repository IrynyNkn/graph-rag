import type { Citation, RetrievedGraph } from '@graph-rag/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  let observers: ResizeObserverCallback[];

  beforeEach(() => {
    observers = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          observers.push(callback);
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

  function measure() {
    act(() => {
      for (const observer of observers) {
        observer(
          [{ contentRect: { width: 900, height: 700 } } as ResizeObserverEntry],
          {} as ResizeObserver,
        );
      }
    });
  }

  const idle: Omit<ComponentProps<typeof GraphView>, 'graph'> = {
    isSearching: false,
    isAnswering: false,
    citations: [],
    sourceChunkId: null,
  };

  function renderSized(value: RetrievedGraph | null, isSearching = false, isAnswering = false) {
    const view = render(
      <GraphView {...idle} graph={value} isSearching={isSearching} isAnswering={isAnswering} />,
    );
    measure();
    return view;
  }

  function renderWith(props: Partial<typeof idle>) {
    const view = render(<GraphView {...idle} {...props} graph={graph} />);
    measure();
    return view;
  }

  const chip = (name: string) =>
    [...document.querySelectorAll('.node')].find((item) => item.textContent === name) as Element;

  it('shows an invitation without a graph', () => {
    renderSized(null);

    expect(screen.getByText(/appears here/)).toBeTruthy();
  });

  it('shows an invitation for a graph with no nodes', () => {
    renderSized({ nodes: [], edges: [] });

    expect(screen.getByText(/appears here/)).toBeTruthy();
  });

  it('says it is searching, in place of the invitation', () => {
    const { container } = renderSized(null, true);

    expect(screen.getByText('Searching')).toBeTruthy();
    expect(screen.queryByText(/appears here/)).toBeNull();
    expect(container.querySelector('.graph.is-searching')).toBeTruthy();
  });

  it('draws nodes with readable names, edges, columns, counts and a legend', async () => {
    const { container } = renderSized(graph);

    expect(screen.getByText('Owen Blackwood')).toBeTruthy();
    expect(container.querySelectorAll('.node')).toHaveLength(3);
    expect(container.querySelectorAll('.node.is-seed')).toHaveLength(1);
    expect(container.querySelectorAll('.edge')).toHaveLength(2);
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('1 hop')).toBeTruthy();
    expect(screen.getByText('2 hops')).toBeTruthy();
    expect(screen.getByText('Strongest path')).toBeTruthy();
    await waitFor(() =>
      expect(container.querySelector('.graph-counts')?.textContent).toBe('3 entities2 relations'),
    );
  });

  it('marks the strongest path through the graph', () => {
    const { container } = renderSized(graph);

    expect(container.querySelectorAll('.edge.is-strongest')).toHaveLength(2);
    expect(container.querySelectorAll('.node.is-on-path')).toHaveLength(3);
  });

  it('runs a light along the strongest path only while the answer is being written', () => {
    const { container, rerender } = renderSized(graph, false, true);

    expect(container.querySelectorAll('.edge-pulse')).toHaveLength(2);

    rerender(<GraphView {...idle} graph={graph} />);

    expect(container.querySelectorAll('.edge-pulse')).toHaveLength(0);
  });

  it('lights the relations a source gave and dims the rest, without a card', () => {
    const { container } = renderWith({ sourceChunkId: 'c1' });

    expect(container.querySelectorAll('.edge.is-lit')).toHaveLength(1);
    expect(container.querySelectorAll('.edge.is-dimmed')).toHaveLength(1);
    expect(chip('Search Index').classList).toContain('is-dimmed');
    expect(chip('Search Team').classList).not.toContain('is-dimmed');
    expect(container.querySelector('.graph-card')).toBeNull();
    expect(container.querySelector('.edge-label')).toBeNull();
  });

  it('dims nothing for a source that gave this graph no relation', () => {
    const { container } = renderWith({ sourceChunkId: 'elsewhere' });

    expect(container.querySelector('.is-dimmed')).toBeNull();
  });

  it('quotes the sentence behind a relation in its card', async () => {
    const citation: Citation = {
      chunkId: 'c2',
      documentId: 'd',
      documentName: 'handbook.txt',
      text: 'It is big. The Search Team has the Search Index.',
    };
    const { container } = renderWith({ citations: [citation] });
    const quoted = [...container.querySelectorAll('.edge-target')];

    for (const line of quoted) {
      fireEvent.mouseEnter(line);
      if (screen.queryByText(/has the Search Index/) !== null) {
        break;
      }
    }

    expect(screen.getByText(/has the Search Index/).querySelector('cite')?.textContent).toBe(
      'handbook.txt',
    );
  });

  it('explains a node on hover, labels its relations and dims what it is not linked to', async () => {
    const { container } = renderSized(graph);

    fireEvent.mouseEnter(chip('Owen Blackwood'));

    expect(screen.getByText('Manages the Search Team.')).toBeTruthy();
    expect(screen.getByText('PERSON / activation 1.25')).toBeTruthy();
    expect(screen.getByText('manages →')).toBeTruthy();
    expect(chip('Search Index').classList).toContain('is-dimmed');
    expect(chip('Search Team').classList).not.toContain('is-dimmed');
    expect(chip('Owen Blackwood').classList).toContain('is-focused');
    expect(container.querySelectorAll('.edge.is-dimmed')).toHaveLength(1);
    expect(container.querySelectorAll('.edge.is-lit')).toHaveLength(1);

    fireEvent.mouseLeave(chip('Owen Blackwood'));

    await waitFor(() => expect(screen.queryByText('Manages the Search Team.')).toBeNull());
    expect(container.querySelectorAll('.is-dimmed')).toHaveLength(0);
  });

  it('keeps one card when the pointer crosses from a node to the next', () => {
    const { container } = renderSized(graph);

    fireEvent.mouseEnter(chip('Owen Blackwood'));
    fireEvent.mouseLeave(chip('Owen Blackwood'));
    fireEvent.mouseEnter(chip('Search Team'));

    expect(container.querySelectorAll('.graph-card')).toHaveLength(1);
    expect(screen.getByText('TEAM / activation 0.50')).toBeTruthy();
  });

  it('reads a relation that runs against the flow backward', () => {
    renderSized(graph);

    fireEvent.mouseEnter(chip('Search Team'));

    expect(screen.getByText('← owned by')).toBeTruthy();
  });

  it('opens the same card from the keyboard', () => {
    renderSized(graph);

    fireEvent.focus(chip('Owen Blackwood'));

    expect(screen.getByText('Manages the Search Team.')).toBeTruthy();
  });

  it('drops the card when the graph changes under a still pointer', async () => {
    const { rerender } = renderSized(graph);
    fireEvent.mouseEnter(chip('Owen Blackwood'));
    expect(screen.getByText('Manages the Search Team.')).toBeTruthy();

    rerender(<GraphView {...idle} graph={{ ...graph, edges: [] }} />);

    await waitFor(() => expect(screen.queryByText('Manages the Search Team.')).toBeNull());
  });

  it('calls a node without a type an entity', () => {
    renderSized(graph);

    fireEvent.mouseEnter(chip('Search Index'));

    expect(screen.getByText('entity / activation 0.40')).toBeTruthy();
  });

  it('explains an edge on hover with its unique relations', () => {
    const { container } = renderSized(graph);
    const [, strongest] = container.querySelectorAll('.edge-target');

    fireEvent.mouseEnter(strongest as Element);

    expect(screen.getByText('manages, leads')).toBeTruthy();
    expect(screen.getByText('weight 0.80')).toBeTruthy();
    expect(screen.getByText('manages →')).toBeTruthy();
    expect(container.querySelectorAll('.node.is-dimmed')).toHaveLength(1);
  });

  it('lights the dots under the pointer without re-rendering', () => {
    const { container } = renderSized(graph);
    const canvas = container.querySelector('.graph-canvas') as HTMLElement;

    fireEvent.pointerMove(canvas, { clientX: 40, clientY: 30 });

    expect(canvas.style.getPropertyValue('--spot-x')).toMatch(/px$/);
  });
});
