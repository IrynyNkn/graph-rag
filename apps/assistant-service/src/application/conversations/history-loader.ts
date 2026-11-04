import type { Message } from '@graph-rag/contracts';
import { ChatModel, estimateTokens } from '@graph-rag/inference';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config.js';
import type { ConversationHistory } from './conversation-history.js';
import { ConversationRepository } from './conversation.repository.js';
import { buildSummaryMessages } from './summary.prompt.js';

@Injectable()
export class HistoryLoader {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly chat: ChatModel,
    private readonly config: AppConfig,
  ) {}

  /**
   * Loads what came before `beforeMessageId`. Over budget, it folds the older messages into the
   * summary and keeps fewer than the budget allows, so that this does not repeat on every turn.
   */
  async load(conversationId: string, beforeMessageId: number): Promise<ConversationHistory> {
    const { summary, summarisedUpToMessageId } =
      await this.conversations.findSummaryState(conversationId);
    const messages = await this.conversations.findMessagesBetween(
      conversationId,
      summarisedUpToMessageId,
      beforeMessageId,
    );
    if (totalTokens(messages) <= this.config.history.maxTokens) {
      return { summary, messages: messages.map(toChatMessage) };
    }
    const { older, recent } = splitRecent(messages, this.config.history.recentTokens);
    const folded = await this.fold(conversationId, summary, older);
    return { summary: folded, messages: recent.map(toChatMessage) };
  }

  private async fold(
    conversationId: string,
    summary: string | null,
    messages: Message[],
  ): Promise<string | null> {
    const last = messages.at(-1);
    if (last === undefined) {
      return summary;
    }
    const folded = await this.chat.complete({
      messages: buildSummaryMessages(summary, messages),
      temperature: 0,
      maxOutputTokens: this.config.history.summaryMaxOutputTokens,
    });
    await this.conversations.saveSummary(conversationId, folded, last.id);
    return folded;
  }
}

function totalTokens(messages: Message[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
}

function splitRecent(
  messages: Message[],
  recentTokens: number,
): { older: Message[]; recent: Message[] } {
  let tokens = 0;
  const newestOlder = messages.findLastIndex((message) => {
    tokens += estimateTokens(message.content);
    return tokens > recentTokens;
  });
  return { older: messages.slice(0, newestOlder + 1), recent: messages.slice(newestOlder + 1) };
}

function toChatMessage({ role, content }: Message) {
  return { role, content };
}
