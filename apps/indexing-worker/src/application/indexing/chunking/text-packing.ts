const PARAGRAPH_SEPARATOR = '\n\n';
const SENTENCE_SEPARATOR = ' ';
const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });

/** Greedily fills chunks of at most `maxChars`, splitting only pieces that do not fit in one. */
export function packTexts(pieces: string[], maxChars: number): string[] {
  const parts = pieces.flatMap((piece) => splitOversized(piece, maxChars));
  return greedyJoin(parts, PARAGRAPH_SEPARATOR, maxChars);
}

function splitOversized(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return [text];
  }
  const parts = [...sentences.segment(text)]
    .map(({ segment }) => segment.trim())
    .filter((segment) => segment.length > 0)
    .flatMap((sentence) => splitLongSentence(sentence, maxChars));
  return greedyJoin(parts, SENTENCE_SEPARATOR, maxChars);
}

function splitLongSentence(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) {
    return [sentence];
  }
  const words = sentence.split(/\s+/).flatMap((word) => cutLongWord(word, maxChars));
  return greedyJoin(words, SENTENCE_SEPARATOR, maxChars);
}

function cutLongWord(word: string, maxChars: number): string[] {
  const parts: string[] = [];
  for (let start = 0; start < word.length; start += maxChars) {
    parts.push(word.slice(start, start + maxChars));
  }
  return parts;
}

function greedyJoin(parts: string[], separator: string, maxChars: number): string[] {
  const joined: string[] = [];
  let current = '';
  for (const part of parts) {
    if (current.length > 0 && current.length + separator.length + part.length > maxChars) {
      joined.push(current);
      current = part;
    } else {
      current = current.length > 0 ? current + separator + part : part;
    }
  }
  if (current.length > 0) {
    joined.push(current);
  }
  return joined;
}
