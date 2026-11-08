import type { ChatMessage } from '@graph-rag/inference';
import type { ConversationHistory } from '../../conversations/conversation-history.js';
import { buildMessages } from './answer.prompt.js';

const INSTRUCTIONS = `You are an assistant that answers questions from the user's documents, and this message can be answered from the conversation alone.

Reply using only what was said in this conversation. Be direct and concise, in the language of the message. If the answer is not in the conversation, say so. Never add anything from outside knowledge.`;

export function buildConversationMessages(
  history: ConversationHistory,
  question: string,
): ChatMessage[] {
  return buildMessages(INSTRUCTIONS, history, question);
}
