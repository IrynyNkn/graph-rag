import { setTimeout as delay } from 'node:timers/promises';
import { InvalidModelOutputError, ModelUnavailableError } from './errors.js';

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
}

export async function withRetries<T>(operation: () => Promise<T>, policy: RetryPolicy): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryable(error) || attempt >= policy.maxAttempts) {
        throw error;
      }
      await delay(policy.baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

function isRetryable(error: unknown): boolean {
  return error instanceof ModelUnavailableError || error instanceof InvalidModelOutputError;
}
