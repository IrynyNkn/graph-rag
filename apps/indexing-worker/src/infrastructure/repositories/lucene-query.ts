const LUCENE_SPECIAL_CHARS = /[+\-&|!(){}[\]^"~*?:\\/]/g;

/**
 * The name reaches the index as a bound parameter, which stops Cypher injection, but Lucene still
 * parses its contents. Unescaped, "R&D" or "C++" would break the query or change what it matches.
 */
export function toLuceneQuery(name: string): string {
  return name.replace(LUCENE_SPECIAL_CHARS, '\\$&');
}
