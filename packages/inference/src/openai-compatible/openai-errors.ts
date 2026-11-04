import { APIError } from 'openai';
import type { InferenceError } from '../errors.js';
import { toInferenceError } from '../provider-errors.js';

export function toOpenAiError(error: unknown): InferenceError {
  const status = error instanceof APIError ? error.status : undefined;
  return toInferenceError('OpenAI-compatible provider', error, status);
}
