import { describe, expect, it } from 'vitest';
import type { DocumentBlock } from '../parsing/parsed-document.js';
import { DocumentChunker } from './document-chunker.js';
import { HeadingChunkingStrategy } from './heading-chunking.strategy.js';
import { ParagraphChunkingStrategy } from './paragraph-chunking.strategy.js';
import { SlidingWindowChunkingStrategy } from './sliding-window-chunking.strategy.js';

const heading = (text: string, level = 1): DocumentBlock => ({ kind: 'heading', level, text });
const paragraph = (text: string): DocumentBlock => ({ kind: 'paragraph', text });

describe('HeadingChunkingStrategy', () => {
  const strategy = new HeadingChunkingStrategy(60);

  it('needs at least two headings and some text', () => {
    expect(strategy.supports({ blocks: [heading('A'), paragraph('text')] })).toBe(false);
    expect(strategy.supports({ blocks: [heading('A'), heading('B')] })).toBe(false);
    expect(strategy.supports({ blocks: [heading('A'), heading('B'), paragraph('x')] })).toBe(true);
  });

  it('tracks the heading path by level', () => {
    const drafts = new HeadingChunkingStrategy(30).chunk({
      blocks: [
        heading('Guide'),
        heading('Install', 2),
        paragraph('Install text here.'),
        heading('Usage', 2),
        paragraph('Usage text goes here.'),
      ],
    });

    expect(drafts).toEqual([
      { text: 'Install\n\nInstall text here.', headingPath: ['Guide', 'Install'] },
      { text: 'Usage\n\nUsage text goes here.', headingPath: ['Guide', 'Usage'] },
    ]);
  });

  it('merges short neighbours and keeps only their common path', () => {
    const drafts = strategy.chunk({
      blocks: [
        heading('Guide'),
        heading('Install', 2),
        paragraph('Short.'),
        heading('Usage', 2),
        paragraph('Short too.'),
      ],
    });

    expect(drafts).toEqual([
      {
        text: 'Install\n\nShort.\n\nUsage\n\nShort too.',
        headingPath: ['Guide'],
      },
    ]);
  });

  it('spends no chunk on a heading without text', () => {
    const drafts = strategy.chunk({
      blocks: [heading('Empty'), heading('Full'), paragraph('Body.'), heading('Trailing')],
    });

    expect(drafts).toEqual([{ text: 'Full\n\nBody.', headingPath: ['Full'] }]);
  });

  it('does not lose text before the first heading', () => {
    const drafts = strategy.chunk({
      blocks: [paragraph('Preface.'), heading('A'), paragraph('Body.'), heading('B')],
    });

    expect(drafts.map((draft) => draft.text).join(' ')).toContain('Preface.');
  });

  it('splits a section that does not fit', () => {
    const long = 'A sentence of some length. '.repeat(10).trim();

    const drafts = strategy.chunk({ blocks: [heading('A'), paragraph(long), heading('B')] });

    expect(drafts.length).toBeGreaterThan(1);
    expect(drafts.every((draft) => draft.text.length <= 60)).toBe(true);
  });
});

describe('ParagraphChunkingStrategy', () => {
  const strategy = new ParagraphChunkingStrategy(20);

  it('refuses a wall of text', () => {
    expect(strategy.supports({ blocks: [paragraph('x'.repeat(100))] })).toBe(false);
    expect(strategy.supports({ blocks: [paragraph('x'.repeat(100)), paragraph('y')] })).toBe(false);
  });

  it('accepts text with real paragraphs', () => {
    expect(strategy.supports({ blocks: [paragraph('short'), paragraph('short')] })).toBe(true);
  });

  it('packs paragraphs and treats headings as text', () => {
    const drafts = strategy.chunk({ blocks: [heading('Title'), paragraph('Body.')] });

    expect(drafts).toEqual([{ text: 'Title\n\nBody.', headingPath: [] }]);
  });
});

describe('SlidingWindowChunkingStrategy', () => {
  const strategy = new SlidingWindowChunkingStrategy(20, 5);

  it('supports anything', () => {
    expect(strategy.supports()).toBe(true);
  });

  it('returns short text as it is', () => {
    expect(strategy.chunk({ blocks: [paragraph('Short.')] })).toEqual([
      { text: 'Short.', headingPath: [] },
    ]);
  });

  it('covers the whole text in windows that overlap on word boundaries', () => {
    const words = Array.from({ length: 40 }, (_, index) => `w${index}`);

    const drafts = strategy.chunk({ blocks: [paragraph(words.join(' '))] });

    const covered = new Set(drafts.flatMap((draft) => draft.text.split(' ')));
    expect(words.every((word) => covered.has(word))).toBe(true);
    expect(drafts.every((draft) => draft.text.length <= 20)).toBe(true);
    expect(drafts[1]?.text.split(' ')[0]).toBe(
      drafts[0]?.text.split(' ').find((word) => drafts[1]?.text.startsWith(word)),
    );
  });

  it('cuts text without spaces and still moves forward', () => {
    const drafts = strategy.chunk({ blocks: [paragraph('x'.repeat(100))] });

    expect(drafts.every((draft) => draft.text.length <= 20)).toBe(true);
    expect(drafts.reduce((sum, draft) => sum + draft.text.length, 0)).toBeGreaterThanOrEqual(100);
  });
});

describe('DocumentChunker', () => {
  const chunker = new DocumentChunker([
    new HeadingChunkingStrategy(100),
    new ParagraphChunkingStrategy(100),
    new SlidingWindowChunkingStrategy(100, 10),
  ]);

  it('numbers chunks from the strategy that supports the document', () => {
    const chunks = chunker.chunk({
      blocks: [heading('A'), paragraph('x'.repeat(90)), heading('B'), paragraph('y'.repeat(90))],
    });

    expect(chunks.map((chunk) => [chunk.ordinal, chunk.headingPath])).toEqual([
      [0, ['A']],
      [1, ['B']],
    ]);
  });

  it('falls through to the sliding window for a wall of text', () => {
    const chunks = chunker.chunk({ blocks: [paragraph('word '.repeat(100))] });

    expect(chunks.length).toBeGreaterThan(1);
  });

  it('is deterministic, because chunk IDs depend on it', () => {
    const blocks = [heading('A'), paragraph('x '.repeat(200)), heading('B'), paragraph('y')];

    expect(chunker.chunk({ blocks })).toEqual(chunker.chunk({ blocks }));
  });

  it('fails when no strategy applies', () => {
    expect(() => new DocumentChunker([]).chunk({ blocks: [] })).toThrow('No chunking strategy');
  });
});
