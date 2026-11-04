export const FIND_WRITTEN_ORDINALS = `
  MATCH (chunk:Chunk {documentId: $documentId})
  RETURN chunk.ordinal AS ordinal
`;

// The unique constraint on Chunk.id makes a repeat of a written chunk fail instead of doubling it.
export const CREATE_CHUNK = `
  CREATE (:Chunk {
    id: $id,
    documentId: $documentId,
    documentName: $documentName,
    ordinal: $ordinal,
    text: $text
  })
`;

export const ADD_MENTIONS = `
  MATCH (chunk:Chunk {id: $id})
  UNWIND $entities AS entity
  MERGE (e:Entity {name: entity.name})
    ON CREATE SET e.type = entity.type, e.revision = 0, e.refreshedRevision = 0
  SET e.revision = e.revision + 1
  CREATE (chunk)-[:MENTIONS {description: entity.description}]->(e)
`;

export const ADD_RELATIONS = `
  UNWIND $triples AS triple
  MATCH (subject:Entity {name: triple.subject})
  MATCH (object:Entity {name: triple.object})
  MERGE (subject)-[relation:RELATES_TO]->(object)
    ON CREATE SET relation.relations = [], relation.chunkIds = []
  SET relation.relations = relation.relations + triple.relation,
      relation.chunkIds = relation.chunkIds + $id
`;
