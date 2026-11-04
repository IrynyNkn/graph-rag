import type { ChatMessage } from '@graph-rag/inference';
import {
  formatHistory,
  type ConversationHistory,
} from '../../conversations/conversation-history.js';

const INSTRUCTIONS = `You prepare the latest user message for a question-answering system over the user's documents.

Return two fields:
- route: "knowledge_base" if answering needs facts from the documents. "conversation" only if the message can be answered from the conversation alone: a greeting, thanks, or a request about what was already said, such as "shorten that". When unsure, use "knowledge_base".
- standaloneQuestion: the latest message rewritten so that it can be understood without the conversation. Replace pronouns and references with the names they stand for. Keep its meaning and language. If it is already clear on its own, repeat it as it is.

Return only a JSON object with the fields "route" and "standaloneQuestion".`;

export function buildAnalysisMessages(
  question: string,
  history: ConversationHistory,
): ChatMessage[] {
  return [
    { role: 'system', content: INSTRUCTIONS },
    {
      role: 'user',
      content: `Conversation:\n${formatHistory(history)}\n\nLatest message: ${question}`,
    },
  ];
}
