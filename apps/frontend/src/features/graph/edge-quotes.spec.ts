import type { Citation, GraphEdge } from '@graph-rag/contracts';
import { describe, expect, it } from 'vitest';
import { findEdgeQuotes } from './edge-quotes';

const edge: GraphEdge = {
  source: 'owen blackwood',
  target: 'search team',
  relations: ['manages'],
  chunkIds: ['c1'],
  weight: 1,
};

const citationOf = (text: string, chunkId = 'c1'): Citation => ({
  chunkId,
  documentId: 'd',
  documentName: 'handbook.txt',
  text,
});

describe('findEdgeQuotes', () => {
  it('quotes the sentence that names both ends of the relation', () => {
    const text =
      'The Search Team is large. Owen Blackwood joined in May.\nOwen Blackwood manages the Search Team. It grew.';

    expect(findEdgeQuotes(edge, [citationOf(text)])).toEqual([
      { text: 'Owen Blackwood manages the Search Team.', documentName: 'handbook.txt' },
    ]);
  });

  it('settles for the first sentence that names one end', () => {
    const text = 'It grew. The Search Team is large. The Search Team is new.';

    expect(findEdgeQuotes(edge, [citationOf(text)])[0]?.text).toBe('The Search Team is large.');
  });

  it('starts at the beginning when no sentence names either end', () => {
    expect(findEdgeQuotes(edge, [citationOf('First. Second.')])[0]?.text).toBe('First.');
  });

  it('shortens a long sentence at a word', () => {
    const text = `Owen Blackwood manages the Search Team ${'and more '.repeat(40)}`;

    const [quote] = findEdgeQuotes(edge, [citationOf(text)]);

    expect(quote?.text.length).toBeLessThanOrEqual(181);
    expect(quote?.text.endsWith('more…') || quote?.text.endsWith('and…')).toBe(true);
  });

  it('skips chunks the relation did not come from, and keeps the card short', () => {
    const several = { ...edge, chunkIds: ['c1', 'c2', 'c3'] };
    const citations = [
      citationOf('Other.', 'c0'),
      citationOf('One.', 'c1'),
      citationOf('Two.', 'c2'),
      citationOf('Three.', 'c3'),
    ];

    expect(findEdgeQuotes(several, citations).map((quote) => quote.text)).toEqual(['One.', 'Two.']);
  });
});
