import type { Conversation } from '@graph-rag/contracts';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const DAYS_SHOWN_AS_DAYS = 7;

export const UNTITLED = 'New chat';

export function titleOf(conversation: Conversation): string {
  return conversation.title ?? UNTITLED;
}

export function filterConversations(conversations: Conversation[], query: string): Conversation[] {
  const wanted = query.trim().toLocaleLowerCase();
  if (wanted.length === 0) {
    return conversations;
  }
  return conversations.filter((item) => titleOf(item).toLocaleLowerCase().includes(wanted));
}

/** Short and relative, the way a list of recent things is read. */
export function describeAge(timestamp: string, now: Date): string {
  const age = now.getTime() - new Date(timestamp).getTime();
  if (age < MINUTE_MS) {
    return 'now';
  }
  if (age < HOUR_MS) {
    return `${Math.floor(age / MINUTE_MS)} min`;
  }
  if (age < DAY_MS) {
    return `${Math.floor(age / HOUR_MS)} h`;
  }
  if (age < DAYS_SHOWN_AS_DAYS * DAY_MS) {
    return `${Math.floor(age / DAY_MS)} d`;
  }
  return new Date(timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

/** Moves through a list with the arrow keys, wrapping around at both ends. */
export function moveHighlight(index: number, step: number, count: number): number {
  return count === 0 ? 0 : (index + step + count) % count;
}

export function shortcutLabel(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? '⌘K' : 'Ctrl K';
}
