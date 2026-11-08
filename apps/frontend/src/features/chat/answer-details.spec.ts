import { describe, expect, it } from 'vitest';
import { detailRows, formatDuration, totalMs } from './answer-details';

const timings = { analysisMs: 900, searchMs: 400, waitMs: 1100, writingMs: 1800 };
const models = { chat: 'chat-model', embedding: 'embedding-model' };

describe('formatDuration', () => {
  it('uses the unit that reads best', () => {
    expect(formatDuration(320)).toBe('320 ms');
    expect(formatDuration(4200)).toBe('4.2 s');
    expect(formatDuration(72_000)).toBe('1 min 12 s');
  });
});

describe('totalMs', () => {
  it('adds up the stages, with or without a search', () => {
    expect(totalMs(timings)).toBe(4200);
    expect(totalMs({ ...timings, searchMs: null })).toBe(3800);
  });
});

describe('detailRows', () => {
  const labels = (rows: { label: string }[]) => rows.map((row) => row.label);

  it('lists every stage and both models of an answer that searched', () => {
    expect(detailRows(timings, models)).toEqual([
      { label: 'Understanding the question', value: '900 ms' },
      { label: 'Searching the graph', value: '400 ms' },
      { label: 'Waiting for the first word', value: '1.1 s' },
      { label: 'Writing the answer', value: '1.8 s' },
      { label: 'Chat model', value: 'chat-model' },
      { label: 'Embedding model', value: 'embedding-model' },
    ]);
  });

  it('leaves out the search and the embedding model when nothing was searched', () => {
    expect(labels(detailRows({ ...timings, searchMs: null }, models))).toEqual([
      'Understanding the question',
      'Waiting for the first word',
      'Writing the answer',
      'Chat model',
    ]);
  });

  it('works without models', () => {
    expect(labels(detailRows(timings, undefined))).not.toContain('Chat model');
  });
});
