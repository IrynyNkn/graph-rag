import type { Element, ElementContent, Root, RootContent, Text } from 'hast';

const NOT_SPLIT_INTO_WORDS = new Set(['pre', 'code']);
const BLOCKS = new Set([
  'p',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
]);

/**
 * A streaming answer can end inside a pair of asterisks. Closed early, its words are bold from the
 * start, and an opening pair with nothing after it yet is left out, as `****` would draw a line.
 */
export function closeOpenMarkers(text: string): string {
  const isOpen = text.split('**').length % 2 === 0;
  if (!isOpen) {
    return text.replace(/(?<!\*)\*$/, '');
  }
  return text.endsWith('**') ? text.slice(0, -2) : `${text.trimEnd()}**`;
}

/**
 * Gives every word of a streaming answer its own element, and the answer a caret at its end. A word
 * keeps its place among its siblings as text arrives, so that only new ones run their entrance.
 */
export function rehypeLiveAnswer() {
  return (tree: Root): void => {
    splitIntoWords(tree);
    findLastBlock(tree).children.push(caret());
  };
}

function splitIntoWords(parent: Root | Element): void {
  const children: (RootContent | ElementContent)[] = parent.children;
  parent.children = children.flatMap((child): ElementContent[] => {
    if (child.type === 'doctype') {
      return [];
    }
    if (child.type === 'text') {
      return toWords(child);
    }
    if (child.type === 'element' && !NOT_SPLIT_INTO_WORDS.has(child.tagName)) {
      splitIntoWords(child);
    }
    return [child];
  });
}

function toWords({ value }: Text): ElementContent[] {
  return value
    .split(/(\s+)/)
    .filter((part) => part !== '')
    .map((part) => (part.trim() === '' ? { type: 'text', value: part } : word(part)));
}

function word(value: string): Element {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['word'] },
    children: [{ type: 'text', value }],
  };
}

function caret(): Element {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['answer-caret'], ariaHidden: 'true' },
    children: [],
  };
}

function findLastBlock(parent: Root | Element): Root | Element {
  const children: (RootContent | ElementContent)[] = parent.children;
  const last = children.findLast(
    (child): child is Element => child.type === 'element' && BLOCKS.has(child.tagName),
  );
  return last === undefined ? parent : findLastBlock(last);
}
