import type { Citation, Message, RetrievedGraph } from '@graph-rag/contracts';
import { describe, expect, it } from 'vitest';
import { splitAnswer } from './answer-parts';
import { applyTurnEvent, finishTurn, IDLE_TURN, isSearching, startTurn } from './turn-state';
import {
  describeLoss,
  dropMessagesFrom,
  findActiveAnswer,
  findLivePlace,
  groupIntoTurns,
  isChatEmpty,
  isSameQuestion,
  selectGraph,
} from './turns';

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

const question = (id: number): Message => ({
  id,
  role: 'user',
  content: 'Question',
  createdAt: '2026-01-01T00:00:00.000Z',
  metadata: null,
});

describe('isSameQuestion', () => {
  it('ignores case and punctuation', () => {
    expect(isSameQuestion('who manages the team', 'Who manages the team?')).toBe(true);
  });

  it('notices another word', () => {
    expect(isSameQuestion('Who manages it?', 'Who manages the team?')).toBe(false);
  });
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

  it('records how the question was understood', () => {
    const state = applyTurnEvent(startTurn('id', 'Q'), {
      type: 'analysis',
      route: 'conversation',
      standaloneQuestion: 'S',
    });

    expect(state.analysis).toEqual({ route: 'conversation', standaloneQuestion: 'S' });
  });

  it('ignores the end of a turn, which the saved messages show', () => {
    const state = startTurn('id', 'Q');

    expect(applyTurnEvent(state, { type: 'done', message: answer(1, null) })).toBe(state);
  });

  it('is searching until the graph arrives, unless the conversation will answer', () => {
    const started = startTurn('id', 'Q');
    const route = (value: 'knowledge_base' | 'conversation') =>
      applyTurnEvent(started, { type: 'analysis', route: value, standaloneQuestion: 'Q' });

    expect(isSearching(IDLE_TURN)).toBe(false);
    expect(isSearching(started)).toBe(true);
    expect(isSearching(route('knowledge_base'))).toBe(true);
    expect(isSearching(route('conversation'))).toBe(false);
    expect(isSearching({ ...started, graph: graphOf('a') })).toBe(false);
  });

  it('keeps only the error when it finishes', () => {
    const state = { ...startTurn('id', 'Q'), text: 'Partial', error: 'down', isStopping: true };

    expect(finishTurn(state)).toEqual({ ...IDLE_TURN, conversationId: 'id', error: 'down' });
  });
});

describe('groupIntoTurns', () => {
  it('pairs each question with its answer', () => {
    const turns = groupIntoTurns([question(1), answer(2, null), question(3), answer(4, null)]);

    expect(turns.map((turn) => [turn.question?.id, turn.answer?.id])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('keeps a question whose answer never came', () => {
    const turns = groupIntoTurns([question(1), question(2), answer(3, null)]);

    expect(turns.map((turn) => [turn.question?.id, turn.answer?.id])).toEqual([
      [1, undefined],
      [2, 3],
    ]);
  });

  it('keeps an answer without a question', () => {
    const turns = groupIntoTurns([answer(1, null)]);

    expect(turns).toEqual([{ question: null, answer: answer(1, null) }]);
  });
});

describe('isChatEmpty', () => {
  it('is empty only when nothing has been asked and nothing is on its way', () => {
    expect(isChatEmpty([], IDLE_TURN, false)).toBe(true);
    expect(isChatEmpty([], IDLE_TURN, true)).toBe(false);
    expect(isChatEmpty([question(1)], IDLE_TURN, false)).toBe(false);
    expect(isChatEmpty([], startTurn('id', 'Q'), false)).toBe(false);
  });
});

describe('findLivePlace', () => {
  const asked = (id: number, content: string): Message => ({ ...question(id), content });
  const saved = (id: number, content: string): Message => ({ ...answer(id, null), content });

  it('has no place without a turn', () => {
    expect(findLivePlace([], IDLE_TURN)).toBe('none');
  });

  it('opens a new turn for a question that is not saved yet', () => {
    const turns = groupIntoTurns([asked(1, 'Older'), saved(2, 'Older answer')]);

    expect(findLivePlace(turns, startTurn('id', 'New'))).toBe('new-turn');
    expect(findLivePlace([], startTurn('id', 'New'))).toBe('new-turn');
  });

  it('joins the saved question when a reload brought it in early', () => {
    const turns = groupIntoTurns([asked(1, 'New')]);

    expect(findLivePlace(turns, startTurn('id', 'New'))).toBe('last-turn');
  });

  it('opens a new turn when the same question is asked again', () => {
    const turns = groupIntoTurns([asked(1, 'Same'), saved(2, 'The first answer')]);

    expect(findLivePlace(turns, startTurn('id', 'Same'))).toBe('new-turn');
  });

  it('steps aside once the saved answer has arrived', () => {
    const turns = groupIntoTurns([asked(1, 'Q'), saved(2, 'Done.')]);
    const turn = { ...startTurn('id', 'Q'), text: 'Done. ' };

    expect(findLivePlace(turns, turn)).toBe('none');
  });
});

describe('dropMessagesFrom', () => {
  it('keeps what came before a message', () => {
    const details = {
      id: 'c',
      title: 'T',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      messages: [question(1), answer(2, null), question(3), answer(4, null)],
    };

    expect(dropMessagesFrom(details, 3).messages.map((message) => message.id)).toEqual([1, 2]);
    expect(dropMessagesFrom(details, 1).messages).toEqual([]);
  });
});

describe('describeLoss', () => {
  it('says what asking again throws away', () => {
    expect(describeLoss(0, false)).toBe('');
    expect(describeLoss(0, true)).toBe('This replaces its answer.');
    expect(describeLoss(1, true)).toBe('This replaces its answer and the question after it.');
    expect(describeLoss(3, true)).toBe('This replaces its answer and the 3 questions after it.');
  });
});

describe('splitAnswer', () => {
  it('marks what a model has bolded', () => {
    expect(splitAnswer('It is **Alice** who')).toEqual([
      { text: 'It is ', isBold: false },
      { text: 'Alice', isBold: true },
      { text: ' who', isBold: false },
    ]);
  });

  it('drops the asterisks of a pair that is only half there', () => {
    expect(splitAnswer('It is **Ali')).toEqual([{ text: 'It is Ali', isBold: false }]);
  });

  it('has no parts for no text', () => {
    expect(splitAnswer('')).toEqual([]);
  });
});

describe('findActiveAnswer', () => {
  const messages = [answer(1, graphOf('first')), answer(2, graphOf('second')), answer(3, null)];

  it('prefers the chosen answer', () => {
    expect(findActiveAnswer(messages, 1)?.id).toBe(1);
  });

  it('falls back to the latest answer with a graph', () => {
    expect(findActiveAnswer(messages, null)?.id).toBe(2);
    expect(findActiveAnswer(messages, 3)?.id).toBe(2);
  });

  it('treats a graph with no nodes as no graph', () => {
    expect(findActiveAnswer([answer(1, { nodes: [], edges: [] })], null)).toBeNull();
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
