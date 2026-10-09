const LUCENE_SPECIAL_CHARS = /[+\-&|!(){}[\]^"~*?:\\/]/g;

/**
 * Escapes Lucene query-syntax special characters in text meant to be
 * searched as literal words, not parsed as a query expression. Required
 * before passing any extracted entity name into db.index.fulltext.queryNodes:
 * the string arrives there as a bound Cypher parameter (safe from Cypher
 * injection), but Lucene itself still parses *that string's contents* as a
 * query — a name containing "&", "(", "~" etc. (e.g. "R&D", "C++") would
 * otherwise break parsing or silently change what matches.
 */
export function escapeLuceneQuery(text: string): string {
  return text.replace(LUCENE_SPECIAL_CHARS, '\\$&');
}
