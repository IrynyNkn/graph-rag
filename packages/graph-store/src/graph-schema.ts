export const VECTOR_INDEX_NAME = 'entity_description_embeddings';
export const FULLTEXT_INDEX_NAME = 'entity_name_fulltext';

const CONSTRAINTS_AND_INDEXES = [
  'CREATE CONSTRAINT entity_name IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE',
  'CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (c:Chunk) REQUIRE c.id IS UNIQUE',
  'CREATE INDEX chunk_document IF NOT EXISTS FOR (c:Chunk) ON (c.documentId)',
  `CREATE FULLTEXT INDEX ${FULLTEXT_INDEX_NAME} IF NOT EXISTS FOR (e:Entity) ON EACH [e.name]`,
];

export function schemaStatements(embeddingDimension: number): string[] {
  return [...CONSTRAINTS_AND_INDEXES, vectorIndexStatement(embeddingDimension)];
}

export const FIND_VECTOR_INDEX_DIMENSION = `
  SHOW VECTOR INDEXES YIELD name, options
  WHERE name = '${VECTOR_INDEX_NAME}'
  RETURN options.indexConfig['vector.dimensions'] AS dimension
`;

export const AWAIT_INDEXES = 'CALL db.awaitIndexes(60)';

function vectorIndexStatement(embeddingDimension: number): string {
  return `
    CREATE VECTOR INDEX ${VECTOR_INDEX_NAME} IF NOT EXISTS
    FOR (e:Entity) ON (e.descriptionEmbedding)
    OPTIONS {indexConfig: {
      \`vector.dimensions\`: ${embeddingDimension},
      \`vector.similarity_function\`: 'cosine'
    }}
  `;
}
