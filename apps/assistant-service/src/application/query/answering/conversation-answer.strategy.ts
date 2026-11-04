import type { QueryRoute } from '@graph-rag/contracts';
import { ChatModel } from '@graph-rag/inference';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config.js';
import { AnswerStrategy, type AnswerEvent, type AnswerRequest } from './answer-strategy.js';
import { buildConversationMessages } from './conversation.prompt.js';

@Injectable()
export class ConversationAnswerStrategy extends AnswerStrategy {
  constructor(
    private readonly chat: ChatModel,
    private readonly config: AppConfig,
  ) {
    super();
  }

  supports(route: QueryRoute): boolean {
    return route === 'conversation';
  }

  async *answer({ question, history }: AnswerRequest): AsyncIterable<AnswerEvent> {
    const { temperature, maxOutputTokens } = this.config.answer;
    const tokens = this.chat.stream({
      messages: buildConversationMessages(history, question),
      temperature,
      maxOutputTokens,
    });
    for await (const text of tokens) {
      yield { type: 'token', text };
    }
  }
}
