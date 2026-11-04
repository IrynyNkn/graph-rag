import type { ChatMessage } from '@graph-rag/inference';

export interface ConversationHistory {
  summary: string | null;
  messages: ChatMessage[];
}

export function isEmptyHistory(history: ConversationHistory): boolean {
  return history.summary === null && history.messages.length === 0;
}

export function formatHistory(history: ConversationHistory): string {
  const lines = history.messages.map(({ role, content }) => `${role}: ${content}`);
  return history.summary === null
    ? lines.join('\n')
    : [`Summary of the earlier conversation: ${history.summary}`, ...lines].join('\n');
}
