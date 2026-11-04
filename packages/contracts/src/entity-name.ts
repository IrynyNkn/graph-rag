const LEADING_ARTICLE = /^(the|a|an) (?=\S)/;

/**
 * The identity of an entity in the graph. Indexing writes names through this function and
 * retrieval looks them up through it, so the two sides cannot disagree.
 */
export function normalizeEntityName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ').replace(LEADING_ARTICLE, '');
}
