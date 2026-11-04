import { z, type ZodType } from 'zod';
import { InvalidModelOutputError } from './errors.js';

export type JsonSchema = Record<string, unknown>;

export function toJsonSchema(schema: ZodType): JsonSchema {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}

export function parseStructuredOutput<T>(raw: string, schema: ZodType<T>): T {
  const parsed = schema.safeParse(parseJsonObject(raw));
  if (!parsed.success) {
    throw new InvalidModelOutputError(`Model output does not match the schema: ${parsed.error}`);
  }
  return parsed.data;
}

/** Providers without schema support wrap JSON in prose or code fences, so cut to the object. */
function parseJsonObject(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end < start) {
    throw new InvalidModelOutputError(`Model output has no JSON object: ${preview(raw)}`);
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (error) {
    throw new InvalidModelOutputError(`Model output is not valid JSON: ${preview(raw)}`, {
      cause: error,
    });
  }
}

function preview(text: string): string {
  return text.slice(0, 200);
}
