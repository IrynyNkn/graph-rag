const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
]);
const CHARS_PER_LINE = 22;
// Layout makes room for this many. The full name shows on hover.
const MAX_LINES = 2;

/** Entity names are stored normalised to lower case, which reads badly for people and products. */
export function toDisplayName(name: string): string {
  return name
    .split(' ')
    .map((word, index) => (index > 0 && SMALL_WORDS.has(word) ? word : capitalize(word)))
    .join(' ');
}

export function wrapName(name: string): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of name.split(' ')) {
    if (current.length > 0 && current.length + word.length + 1 > CHARS_PER_LINE) {
      lines.push(current);
      current = word;
    } else {
      current = current.length > 0 ? `${current} ${word}` : word;
    }
  }
  lines.push(current);
  if (lines.length <= MAX_LINES) {
    return lines;
  }
  return lines.slice(0, MAX_LINES).map((line, index) => {
    return index === MAX_LINES - 1 ? `${line}…` : line;
  });
}

function capitalize(word: string): string {
  return word.charAt(0).toLocaleUpperCase() + word.slice(1);
}
