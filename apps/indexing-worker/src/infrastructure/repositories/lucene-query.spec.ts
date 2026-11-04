import { describe, expect, it } from 'vitest';
import { toLuceneQuery } from './lucene-query.js';

describe('toLuceneQuery', () => {
  it('leaves plain words alone', () => {
    expect(toLuceneQuery('owen blackwood')).toBe('owen blackwood');
  });

  it('escapes query syntax', () => {
    expect(toLuceneQuery('r&d')).toBe('r\\&d');
    expect(toLuceneQuery('c++')).toBe('c\\+\\+');
    expect(toLuceneQuery('a (b): c?')).toBe('a \\(b\\)\\: c\\?');
  });
});
