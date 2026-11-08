export interface AnswerPart {
  text: string;
  isBold: boolean;
}

/**
 * Answers are plain text by prompt, but a model can still bold a word, and history keeps it. While
 * an answer streams, a pair of asterisks can be half there, so strays are dropped.
 */
export function splitAnswer(text: string): AnswerPart[] {
  return text
    .split(/\*\*(.+?)\*\*/)
    .map((part, index) => ({ text: part.replaceAll('**', ''), isBold: index % 2 === 1 }))
    .filter((part) => part.text.length > 0);
}
