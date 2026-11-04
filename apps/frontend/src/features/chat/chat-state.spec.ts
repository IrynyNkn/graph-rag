import type { Citation, Message, RetrievedGraph } from '@graph-rag/contracts';
import { describe, expect, it } from 'vitest';
import { selectGraph } from './selected-graph';
import { applyTurnEvent, finishTurn, IDLE_TURN, startTurn } from './turn-state';

const graphOf = (name: string): RetrievedGraph => ({
  nodes: [{ name, type: null, description: null, activation: 1, isSeed: true }],
  edges: [],
});

const citation: Citation = {
  chunkId: 'c',
  documentId: 'd',
  documentName: 'd.txt',
  text: 'Text.',
};

const answer = (id: number, graph: RetrievedGraph | null): Message => ({
  id,
  role: 'assistant',
  content: 'Answer',
  createdAt: '2026-01-01T00:00:00.000Z',
  metadata: { route: 'knowledge_base', standaloneQuestion: 'Q', graph, citations: [] },
});

describe('turn state', () => {
  it('starts streaming with the question', () => {
    expect(startTurn('id', 'Q')).toMatchObject({
      conversationId: 'id',
      question: 'Q',
      isStreaming: true,
    });
  });

  it('accumulates tokens', () => {
    const state = [
      { type: 'token', text: 'Al' },
      { type: 'token', text: 'ice' },
    ].reduce((current, event) => applyTurnEvent(current, event as never), startTurn('id', 'Q'));

    expect(state.text).toBe('Alice');
  });

  it('records the graph, citations and errors', () => {
    let state = startTurn('id', 'Q');
    state = applyTurnEvent(state, { type: 'graph', graph: graphOf('a') });
    state = applyTurnEvent(state, { type: 'citations', citations: [citation] });
    state = applyTurnEvent(state, { type: 'error', message: 'down' });

    expect(state).toMatchObject({
      graph: graphOf('a'),
      citations: [citation],
      error: 'down',
    });
  });

  it('ignores events that change nothing on screen', () => {
    const state = startTurn('id', 'Q');

    expect(
      applyTurnEvent(state, { type: 'analysis', route: 'conversation', standaloneQuestion: 'Q' }),
    ).toBe(state);
    expect(applyTurnEvent(state, { type: 'done', message: answer(1, null) })).toBe(state);
  });

  it('keeps only the error when it finishes', () => {
    const state = { ...startTurn('id', 'Q'), text: 'Partial', error: 'down' };

    expect(finishTurn(state)).toEqual({ ...IDLE_TURN, conversationId: 'id', error: 'down' });
  });
});

describe('selectGraph', () => {
  const messages = [answer(1, graphOf('first')), answer(2, graphOf('second')), answer(3, null)];

  it('shows the graph being retrieved while streaming', () => {
    const turn = { ...startTurn('id', 'Q'), graph: graphOf('live') };

    expect(selectGraph(turn, messages, 1)).toEqual(graphOf('live'));
    expect(selectGraph(startTurn('id', 'Q'), messages, 1)).toBeNull();
  });

  it('shows the chosen answer', () => {
    expect(selectGraph(IDLE_TURN, messages, 1)).toEqual(graphOf('first'));
  });

  it('falls back to the latest answer with a graph', () => {
    expect(selectGraph(IDLE_TURN, messages, null)).toEqual(graphOf('second'));
    expect(selectGraph(IDLE_TURN, messages, 3)).toEqual(graphOf('second'));
  });

  it('is empty without any graph', () => {
    expect(selectGraph(IDLE_TURN, [], null)).toBeNull();
  });
});
