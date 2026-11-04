import { z, type ZodType } from 'zod';

export type Env = Record<string, string | undefined>;

export function parseEnv<T>(schema: ZodType<T>, env: Env): T {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
