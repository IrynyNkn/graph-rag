import {
  conversationDetailsSchema,
  conversationSchema,
  type Conversation,
  type ConversationDetails,
} from '@graph-rag/contracts';
import { requestJson, send } from './http';

export const CONVERSATIONS_URL = '/api/assistant/conversations';

export function listConversations(): Promise<Conversation[]> {
  return requestJson(CONVERSATIONS_URL, conversationSchema.array());
}

export function createConversation(): Promise<Conversation> {
  return requestJson(CONVERSATIONS_URL, conversationSchema, { method: 'POST' });
}

export function getConversation(id: string): Promise<ConversationDetails> {
  return requestJson(`${CONVERSATIONS_URL}/${id}`, conversationDetailsSchema);
}

export async function deleteConversation(id: string): Promise<void> {
  await send(`${CONVERSATIONS_URL}/${id}`, { method: 'DELETE' });
}
