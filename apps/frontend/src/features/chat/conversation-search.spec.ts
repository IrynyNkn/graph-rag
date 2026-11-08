import type { Conversation } from '@graph-rag/contracts';
import { describe, expect, it } from 'vitest';
import {
  describeAge,
  filterConversations,
  moveHighlight,
  shortcutLabel,
  titleOf,
} from './conversation-search';

const conversation = (title: string | null): Conversation => ({
  id: title ?? 'untitled',
  title,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('titleOf', () => {
  it('names a conversation without a title yet', () => {
    expect(titleOf(conversation(null))).toBe('New chat');
    expect(titleOf(conversation('Who?'))).toBe('Who?');
  });
});

describe('filterConversations', () => {
  const all = [conversation('Who owns the Search Index?'), conversation('Hi'), conversation(null)];

  it('keeps everything for an empty query', () => {
    expect(filterConversations(all, '  ')).toEqual(all);
  });

  it('finds by any part of the title, in any case', () => {
    expect(filterConversations(all, 'SEARCH').map(titleOf)).toEqual(['Who owns the Search Index?']);
    expect(filterConversations(all, 'new').map(titleOf)).toEqual(['New chat']);
  });
});

describe('describeAge', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('says how long ago, in the largest whole unit', () => {
    expect(describeAge(ago(20_000), now)).toBe('now');
    expect(describeAge(ago(5 * 60_000), now)).toBe('5 min');
    expect(describeAge(ago(3 * 3_600_000), now)).toBe('3 h');
    expect(describeAge(ago(2 * 86_400_000), now)).toBe('2 d');
  });

  it('gives a date for anything older than a week', () => {
    expect(describeAge('2026-02-20T12:00:00.000Z', now)).toBe('Feb 20');
  });
});

describe('moveHighlight', () => {
  it('moves and wraps around at both ends', () => {
    expect(moveHighlight(0, 1, 3)).toBe(1);
    expect(moveHighlight(2, 1, 3)).toBe(0);
    expect(moveHighlight(0, -1, 3)).toBe(2);
  });

  it('stays put in an empty list', () => {
    expect(moveHighlight(0, 1, 0)).toBe(0);
  });
});

describe('shortcutLabel', () => {
  it('uses the command key on a Mac and Ctrl elsewhere', () => {
    expect(shortcutLabel('MacIntel')).toBe('⌘K');
    expect(shortcutLabel('Win32')).toBe('Ctrl K');
  });
});
