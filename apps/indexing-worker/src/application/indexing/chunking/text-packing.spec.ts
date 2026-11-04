import { describe, expect, it } from 'vitest';
import { packTexts } from './text-packing.js';

describe('packTexts', () => {
  it('fills a chunk with pieces while they fit', () => {
    expect(packTexts(['aaaa', 'bbbb', 'cccc'], 10)).toEqual(['aaaa\n\nbbbb', 'cccc']);
  });

  it('keeps a piece that fits exactly', () => {
    expect(packTexts(['aaaaaaaaaa'], 10)).toEqual(['aaaaaaaaaa']);
  });

  it('splits an oversized piece by sentences', () => {
    const text = 'First sentence here. Second sentence here. Third sentence here.';

    expect(packTexts([text], 45)).toEqual([
      'First sentence here. Second sentence here.',
      'Third sentence here.',
    ]);
  });

  it('splits a sentence that alone is too long at word boundaries', () => {
    expect(packTexts(['one two three four five six'], 10)).toEqual([
      'one two',
      'three four',
      'five six',
    ]);
  });

  it('cuts a word that alone is too long', () => {
    const parts = packTexts(['x'.repeat(25)], 10);

    expect(parts.every((part) => part.length <= 10)).toBe(true);
    expect(parts.join('').replaceAll('\n', '')).toBe('x'.repeat(25));
  });

  it('never exceeds the limit', () => {
    const pieces = ['Short.', 'A much longer piece of text. It has two sentences.', 'Tail.'];

    for (const part of packTexts(pieces, 30)) {
      expect(part.length).toBeLessThanOrEqual(30);
    }
  });

  it('returns nothing for no pieces', () => {
    expect(packTexts([], 10)).toEqual([]);
  });
});
