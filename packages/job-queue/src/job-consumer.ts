import type { ZodType } from 'zod';

export type JobHandler<T> = (job: T) => Promise<void>;

export abstract class JobConsumer {
  /**
   * Handles one job at a time from the queue. Handlers must be idempotent, because a job whose
   * handler throws or whose process dies is delivered again.
   */
  abstract consume<T>(queue: string, schema: ZodType<T>, handler: JobHandler<T>): Promise<void>;
}
