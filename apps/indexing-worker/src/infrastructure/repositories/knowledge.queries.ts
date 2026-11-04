// A plain DELETE on purpose. If a concurrent job has just attached a mention, it fails and is
// retried. DETACH DELETE would destroy that mention.
export const DELETE_ORPHANS = `
  MATCH (e:Entity)
  WHERE e.revision <> e.refreshedRevision AND NOT EXISTS { (:Chunk)-[:MENTIONS]->(e) }
  DELETE e
`;

// Entities without mentions stay stale here, so the next DELETE_ORPHANS can still find them.
export const FIND_STALE_ENTITIES = `
  MATCH (e:Entity)
  WHERE e.revision <> e.refreshedRevision AND EXISTS { (:Chunk)-[:MENTIONS]->(e) }
  WITH e LIMIT $limit
  MATCH (:Chunk)-[mention:MENTIONS]->(e)
  RETURN e.name AS name,
         e.revision AS revision,
         e.description AS description,
         e.descriptionEmbedding IS NOT NULL AS hasEmbedding,
         collect(mention.description) AS mentions
`;

// Writing only at the revision that was read leaves a concurrently changed entity stale.
export const SAVE_REFRESHED_ENTITIES = `
  UNWIND $entities AS update
  MATCH (e:Entity {name: update.name})
  WHERE e.revision = update.revision
  SET e.description = update.description, e.refreshedRevision = update.revision
  WITH e, update
  WHERE update.embedding IS NOT NULL
  CALL db.create.setNodeVectorProperty(e, 'descriptionEmbedding', update.embedding)
`;
