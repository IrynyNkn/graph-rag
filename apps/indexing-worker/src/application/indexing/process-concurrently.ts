/**
 * Runs `worker` over `items` with a limit, and stops taking items once it returns false or throws.
 * Waits for items in flight before settling. Returns false if it stopped early.
 */
export async function processConcurrently<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<boolean>,
): Promise<boolean> {
  const queue = items.values();
  let stopped = false;

  const run = async (): Promise<void> => {
    for (let next = queue.next(); !next.done && !stopped; next = queue.next()) {
      try {
        stopped = !(await worker(next.value)) || stopped;
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  };

  const runners = await Promise.allSettled(Array.from({ length: concurrency }, run));
  const failure = runners.find((runner) => runner.status === 'rejected');
  if (failure) {
    throw failure.reason;
  }
  return !stopped;
}
