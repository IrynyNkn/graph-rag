import { describe, expect, it } from 'vitest';
import {
  documentJobSchema,
  normalizeEntityName,
  sendMessageRequestSchema,
  turnEventSchema,
} from './index.js';

describe('normalizeEntityName', () => {
  it.each([
    ['  Owen   Blackwood ', 'owen blackwood'],
    ['The Checkout Team', 'checkout team'],
    ['A Team', 'team'],
    ['an apple', 'apple'],
    ['The', 'the'],
    ['Theatre', 'theatre'],
  ])('%j becomes %j', (name, expected) => {
    expect(normalizeEntityName(name)).toBe(expected);
  });

  it('is safe to apply twice', () => {
    expect(normalizeEntityName(normalizeEntityName('The Team'))).toBe('team');
  });
});

describe('contracts', () => {
  it('rejects a job without a valid document ID', () => {
    expect(documentJobSchema.safeParse({ documentId: 'nope' }).success).toBe(false);
  });

  it('trims a message and refuses a blank one', () => {
    expect(sendMessageRequestSchema.parse({ content: ' Hi ' })).toEqual({ content: 'Hi' });
    expect(sendMessageRequestSchema.safeParse({ content: '   ' }).success).toBe(false);
  });

  it('tells turn events apart by type', () => {
    expect(turnEventSchema.parse({ type: 'token', text: 'a' })).toEqual({
      type: 'token',
      text: 'a',
    });
    expect(turnEventSchema.safeParse({ type: 'token' }).success).toBe(false);
    expect(turnEventSchema.safeParse({ type: 'unknown' }).success).toBe(false);
  });
});
