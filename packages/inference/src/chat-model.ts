import type { ZodType } from 'zod';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

export abstract class ChatModel {
  abstract complete(request: ChatRequest): Promise<string>;
  abstract completeStructured<T>(request: ChatRequest, schema: ZodType<T>): Promise<T>;
  abstract stream(request: ChatRequest): AsyncIterable<string>;
}
