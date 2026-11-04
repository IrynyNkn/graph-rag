export abstract class JobPublisher {
  /** Resolves once the broker has confirmed the job, and rejects if it cannot. */
  abstract publish(queue: string, job: unknown): Promise<void>;
}
