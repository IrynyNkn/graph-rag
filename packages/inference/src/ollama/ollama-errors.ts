import { z } from 'zod';
import type { InferenceError } from '../errors.js';
import { toInferenceError } from '../provider-errors.js';

// The SDK does not export its ResponseError class, so its shape is the only thing to rely on.
const responseErrorSchema = z.object({ status_code: z.number() });

export function toOllamaError(error: unknown): InferenceError {
  const response = responseErrorSchema.safeParse(error);
  return toInferenceError(
    'Ollama',
    error,
    response.success ? response.data.status_code : undefined,
  );
}
