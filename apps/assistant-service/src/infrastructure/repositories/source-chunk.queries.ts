export const FIND_CHUNKS_BY_IDS = `
  UNWIND range(0, size($ids) - 1) AS position
  MATCH (chunk:Chunk {id: $ids[position]})
  RETURN chunk.id AS chunkId,
         chunk.documentId AS documentId,
         chunk.documentName AS documentName,
         chunk.text AS text
  ORDER BY position
`;

export const FIND_CHUNKS_MENTIONING = `
  UNWIND range(0, size($names) - 1) AS position
  MATCH (chunk:Chunk)-[:MENTIONS]->(:Entity {name: $names[position]})
  WITH chunk, min(position) AS rank
  ORDER BY rank, chunk.id
  LIMIT $limit
  RETURN chunk.id AS chunkId,
         chunk.documentId AS documentId,
         chunk.documentName AS documentName,
         chunk.text AS text
`;
