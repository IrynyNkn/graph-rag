export const FIND_CHUNK_IDS = `
  MATCH (chunk:Chunk {documentId: $documentId})
  RETURN chunk.id AS id
`;

// relations[i] came from chunkIds[i], so both lists are filtered by the same positions.
export const REMOVE_RELATION_ENTRIES = `
  MATCH (:Chunk {documentId: $documentId})-[:MENTIONS]->(:Entity)-[relation:RELATES_TO]-(:Entity)
  WITH DISTINCT relation
  WITH relation,
       [i IN range(0, size(relation.chunkIds) - 1) WHERE NOT relation.chunkIds[i] IN $chunkIds] AS keep
  SET relation.relations = [i IN keep | relation.relations[i]],
      relation.chunkIds = [i IN keep | relation.chunkIds[i]]
  WITH relation, keep
  WHERE size(keep) = 0
  DELETE relation
`;

export const REMOVE_CHUNKS = `
  MATCH (chunk:Chunk {documentId: $documentId})
  OPTIONAL MATCH (chunk)-[:MENTIONS]->(e:Entity)
  SET e.revision = e.revision + 1
  WITH chunk
  DETACH DELETE chunk
`;
