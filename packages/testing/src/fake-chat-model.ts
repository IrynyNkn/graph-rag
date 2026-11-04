import { ChatModel, type ChatRequest } from '@graph-rag/inference';
import type { ZodType } from 'zod';

export type ChatResponder = (request: ChatRequest) => unknown;

/** Replies with whatever `respond` returns, and throws the reply when it is an Error. */
export class FakeChatModel extends ChatModel {
  readonly requests: ChatRequest[] = [];

  constructor(private readonly respond: ChatResponder = () => '') {
    super();
  }

  async complete(request: ChatRequest): Promise<string> {
    return String(this.reply(request));
  }

  async completeStructured<T>(request: ChatRequest, schema: ZodType<T>): Promise<T> {
    return schema.parse(this.reply(request));
  }

  async *stream(request: ChatRequest): AsyncIterable<string> {
    for (const token of String(this.reply(request)).split(/(?<= )/)) {
      yield token;
    }
  }

  /** The whole text of the last request, for assertions on prompts. */
  get lastPrompt(): string {
    return (this.requests.at(-1)?.messages ?? []).map((message) => message.content).join('\n');
  }

  private reply(request: ChatRequest): unknown {
    this.requests.push(request);
    const reply = this.respond(request);
    if (reply instanceof Error) {
      throw reply;
    }
    return reply;
  }
}
