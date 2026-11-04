export interface PublishedJob {
  queue: string;
  job: unknown;
}

/** Shaped like `JobPublisher`, and structural typing keeps this package off the queue client. */
export class FakeJobPublisher {
  readonly published: PublishedJob[] = [];
  failure: Error | null = null;

  async publish(queue: string, job: unknown): Promise<void> {
    if (this.failure) {
      throw this.failure;
    }
    this.published.push({ queue, job });
  }
}
