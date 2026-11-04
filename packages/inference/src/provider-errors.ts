import { InferenceError, ModelRequestError, ModelUnavailableError } from './errors.js';

const TEMPORARY_CLIENT_ERRORS = new Set([408, 409, 425, 429]);

/** Maps a failed provider call by HTTP status. No status means the provider was not reached. */
export function toInferenceError(
  provider: string,
  error: unknown,
  status: number | undefined,
): InferenceError {
  const message = `${provider} request failed: ${String(error)}`;
  return isPermanent(status)
    ? new ModelRequestError(message, { cause: error })
    : new ModelUnavailableError(message, { cause: error });
}

function isPermanent(status: number | undefined): boolean {
  return (
    status !== undefined && status >= 400 && status < 500 && !TEMPORARY_CLIENT_ERRORS.has(status)
  );
}
