import { z, type ZodType } from 'zod';

const errorBodySchema = z.object({ message: z.string() });

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function send(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response));
  }
  return response;
}

export async function requestJson<T>(
  url: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await send(url, init);
  return schema.parse(await response.json());
}

async function readErrorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = errorBodySchema.safeParse(body);
  return parsed.success ? parsed.data.message : `Request failed with status ${response.status}`;
}
