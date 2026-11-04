export const CONVERSATIONS_KEY = ['conversations'];

export function conversationKey(id: string | undefined): readonly unknown[] {
  return [...CONVERSATIONS_KEY, id];
}
