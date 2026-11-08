import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnStopwatch } from './turn-stopwatch.js';

describe('TurnStopwatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function observeAfter(
    stopwatch: TurnStopwatch,
    ms: number,
    type: 'analysis' | 'graph' | 'citations' | 'token',
  ) {
    vi.advanceTimersByTime(ms);
    stopwatch.observe(type);
  }

  it('times every stage of a turn that searched the graph', () => {
    const stopwatch = new TurnStopwatch();

    observeAfter(stopwatch, 100, 'analysis');
    observeAfter(stopwatch, 200, 'graph');
    observeAfter(stopwatch, 50, 'citations');
    observeAfter(stopwatch, 300, 'token');
    observeAfter(stopwatch, 150, 'token');
    observeAfter(stopwatch, 250, 'token');

    expect(stopwatch.read()).toEqual({
      analysisMs: 100,
      searchMs: 200,
      waitMs: 350,
      writingMs: 400,
    });
  });

  it('has no search time when the conversation answered', () => {
    const stopwatch = new TurnStopwatch();

    observeAfter(stopwatch, 100, 'analysis');
    observeAfter(stopwatch, 300, 'token');
    observeAfter(stopwatch, 200, 'token');

    expect(stopwatch.read()).toEqual({
      analysisMs: 100,
      searchMs: null,
      waitMs: 300,
      writingMs: 200,
    });
  });

  it('has no writing time when no word came', () => {
    const stopwatch = new TurnStopwatch();

    observeAfter(stopwatch, 100, 'analysis');
    observeAfter(stopwatch, 200, 'graph');
    observeAfter(stopwatch, 50, 'citations');

    expect(stopwatch.read()).toMatchObject({ waitMs: 50, writingMs: 0 });
  });
});
