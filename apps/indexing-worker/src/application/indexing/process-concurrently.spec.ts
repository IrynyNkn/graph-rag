import { describe, expect, it } from 'vitest';
import { processConcurrently } from './process-concurrently.js';

describe('processConcurrently', () => {
  it('processes every item and reports completion', async () => {
    const seen: number[] = [];

    const finished = await processConcurrently([1, 2, 3], 2, async (item) => {
      seen.push(item);
      return true;
    });

    expect(finished).toBe(true);
    expect(seen.toSorted()).toEqual([1, 2, 3]);
  });

  it('completes on an empty list', async () => {
    await expect(processConcurrently([], 2, async () => true)).resolves.toBe(true);
  });

  it('respects the limit', async () => {
    let running = 0;
    let peak = 0;

    await processConcurrently([1, 2, 3, 4, 5], 2, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return true;
    });

    expect(peak).toBe(2);
  });

  it('stops taking items when the worker returns false', async () => {
    const seen: number[] = [];

    const finished = await processConcurrently([1, 2, 3], 1, async (item) => {
      seen.push(item);
      return item < 2;
    });

    expect(finished).toBe(false);
    expect(seen).toEqual([1, 2]);
  });

  it('stops taking items and rethrows after items in flight settle', async () => {
    const seen: number[] = [];

    await expect(
      processConcurrently([1, 2, 3, 4], 2, async (item) => {
        seen.push(item);
        if (item === 1) {
          throw new Error('boom');
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        return true;
      }),
    ).rejects.toThrow('boom');
    expect(seen).toEqual([1, 2]);
  });
});
