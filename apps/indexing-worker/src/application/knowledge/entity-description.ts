const SEPARATOR = ' | ';

/** Sorted, so the same mentions always give the same text and nothing is re-embedded in vain. */
export function buildEntityDescription(mentions: string[], maxChars: number): string {
  const unique = [...new Set(mentions.map((mention) => mention.trim()))]
    .filter((mention) => mention.length > 0)
    .toSorted();
  let description = '';
  for (const mention of unique) {
    const next = description.length > 0 ? description + SEPARATOR + mention : mention;
    if (next.length > maxChars) {
      break;
    }
    description = next;
  }
  return description;
}

/** The name is part of the text so that short descriptions still match searches by name. */
export function buildEmbeddingText(name: string, description: string): string {
  return description.length > 0 ? `${name}: ${description}` : name;
}
