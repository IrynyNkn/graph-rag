import { FULLTEXT_INDEX_NAME } from '@graph-rag/graph-store';

export const FIND_EXISTING_NAMES = `
  MATCH (e:Entity)
  WHERE e.name IN $names
  RETURN e.name AS name
`;

// The description may not exist yet, because it is derived at the end of a job, so mentions
// stand in for it. That gives the model something to judge by within a single document.
export const FIND_CANDIDATES = `
  CALL db.index.fulltext.queryNodes('${FULLTEXT_INDEX_NAME}', $query) YIELD node, score
  WITH node, score ORDER BY score DESC LIMIT $limit
  OPTIONAL MATCH (:Chunk)-[mention:MENTIONS]->(node)
  WITH node, score, collect(mention.description)[0..$mentionsPerCandidate] AS mentions
  RETURN node.name AS name, node.type AS type, coalesce(node.description, '') AS description, mentions
  ORDER BY score DESC
`;
