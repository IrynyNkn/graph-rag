import type { Message } from '@graph-rag/contracts';
import type { ChatMessage } from '@graph-rag/inference';

const INSTRUCTIONS = `You keep a running summary of a conversation between a user and an assistant.

Rewrite the summary so that it also covers the new messages. Keep names, facts, decisions and open questions. Use at most five sentences. Return only the summary.`;

export function buildSummaryMessages(
  previousSummary: string | null,
  messages: Message[],
): ChatMessage[] {
  const transcript = messages.map(({ role, content }) => `${role}: ${content}`).join('\n');
  return [
    { role: 'system', content: INSTRUCTIONS },
    {
      role: 'user',
      content: `Current summary: ${previousSummary ?? '(none yet)'}\n\nNew messages:\n${transcript}`,
    },
  ];
}
