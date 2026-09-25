/**
 * The local LLM is asked for JSON (Ollama `format: 'json'`), but "asked" is not
 * "guaranteed" — it can still return prose, a code fence, or truncated output.
 * This never throws; callers validate the shape with a schema afterwards.
 */
export function parseJsonSafe(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
