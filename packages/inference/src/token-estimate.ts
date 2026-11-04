const CHARS_PER_TOKEN = 4;

/** A rough count for budgeting prompts. It is not a tokenizer, so leave a margin. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
