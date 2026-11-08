import type { Citation, GraphEdge } from '@graph-rag/contracts';

const MAX_QUOTES = 2;
const MAX_QUOTE_CHARS = 180;
const SENTENCE_BREAK = /(?<=[.!?])\s+|\n+/;

export interface EdgeQuote {
  text: string;
  documentName: string;
}

/** Only chunks that made it into the answer have their text at hand. */
export function findEdgeQuotes(edge: GraphEdge, citations: Citation[]): EdgeQuote[] {
  return citations
    .filter((citation) => edge.chunkIds.includes(citation.chunkId))
    .slice(0, MAX_QUOTES)
    .map(({ text, documentName }) => ({ text: pickSentence(text, edge), documentName }));
}

/** The first sentence that names the most of the two ends of the relation. */
function pickSentence(text: string, { source, target }: GraphEdge): string {
  const names = [source.toLowerCase(), target.toLowerCase()];
  const mentions = (sentence: string) => {
    const lower = sentence.toLowerCase();
    return names.filter((name) => lower.includes(name)).length;
  };
  const sentences = text.split(SENTENCE_BREAK).filter((sentence) => sentence.trim() !== '');
  const [best] = sentences.toSorted((a, b) => mentions(b) - mentions(a));
  return shorten((best ?? text).trim());
}

function shorten(sentence: string): string {
  if (sentence.length <= MAX_QUOTE_CHARS) {
    return sentence;
  }
  const cut = sentence.slice(0, MAX_QUOTE_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}
