import { describe, expect, it } from 'vitest';
import { toDisplayName, wrapName } from './node-names';

describe('toDisplayName', () => {
  it('capitalises each word', () => {
    expect(toDisplayName('wendy abara')).toBe('Wendy Abara');
  });

  it('leaves small words alone, unless they come first', () => {
    expect(toDisplayName('finance and operations')).toBe('Finance and Operations');
    expect(toDisplayName('the search index')).toBe('The Search Index');
  });
});

describe('wrapName', () => {
  it('keeps a short name on one line', () => {
    expect(wrapName('search team')).toEqual(['search team']);
  });

  it('wraps a long name between words', () => {
    expect(wrapName('platform engineering department')).toEqual([
      'platform engineering',
      'department',
    ]);
  });

  it('cuts what does not fit in two lines, because the card shows the full name', () => {
    expect(wrapName('the quick brown fox jumps over the lazy dog again')).toEqual([
      'the quick brown fox',
      'jumps over the lazy…',
    ]);
  });
});
