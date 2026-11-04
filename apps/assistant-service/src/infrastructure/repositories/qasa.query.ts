import { VECTOR_INDEX_NAME } from '@graph-rag/graph-store';

// Adapted from qasa_retriever.py in github.com/kinfi4/qasa-graph-rag. It keeps all state in the
// query instead of writing temporary properties, so concurrent questions cannot disturb each
// other, and it works with Community Edition because it needs APOC but not GDS. Native cosine has
// the scale (cos + 1) / 2, so 2 * s - 1 brings back the raw cosine that QASA gates on.

const FIND_SEEDS = `
  UNWIND $entities AS entity
  OPTIONAL MATCH (exact:Entity {name: entity.name})
  CALL (entity, exact) {
      UNWIND CASE WHEN exact IS NOT NULL THEN [exact] ELSE [] END AS e
      RETURN e.name AS seedName, 1.0 AS seedScore
    UNION ALL
      UNWIND CASE WHEN exact IS NULL THEN [entity] ELSE [] END AS e
      CALL db.index.vector.queryNodes('${VECTOR_INDEX_NAME}', $seedsPerEntity, e.embedding)
      YIELD node, score
      RETURN node.name AS seedName, score AS seedScore
  }
  WITH seedName, max(seedScore) AS seedScore
  WITH collect({name: seedName, score: seedScore}) AS raw, max(seedScore) AS strongest
  WITH [seed IN raw | seed.name] AS seedNames,
       apoc.map.fromPairs([seed IN raw | [seed.name, seed.score / strongest]]) AS resources
`;

// A node only receives from a stronger neighbour, and its similarity to the question gates how
// much. That is what stops activation from flooding the whole graph.
const PROPAGATION_STEP = `
  CALL (resources) {
    UNWIND keys(resources) AS sourceName
    WITH sourceName, resources[sourceName] AS sourceResource, resources
    WHERE sourceResource > $threshold
    MATCH (source:Entity {name: sourceName})-[:RELATES_TO]-(target:Entity)
    WHERE target.descriptionEmbedding IS NOT NULL
      AND (resources[target.name] IS NULL OR resources[target.name] < sourceResource)
    WITH target, sourceResource,
         2 * vector.similarity.cosine(target.descriptionEmbedding, $questionEmbedding) - 1 AS similarity
    WITH target.name AS targetName,
         sum(sourceResource * $decay * CASE WHEN similarity > 0 THEN similarity ELSE 0 END) AS incoming
    WHERE incoming > $threshold
    RETURN collect({name: targetName, incoming: incoming}) AS deltas
  }
  WITH seedNames, apoc.map.merge(resources, apoc.map.fromPairs(
         [delta IN deltas | [delta.name, coalesce(resources[delta.name], 0) + delta.incoming]]
       )) AS resources
`;

const COLLECT_RESULTS = `
  CALL (seedNames, resources) {
    MATCH path = (seed:Entity)-[:RELATES_TO*1..4]-(target:Entity)
    WHERE seed.name IN seedNames
      AND resources[target.name] IS NOT NULL
      AND seed <> target
      AND ALL(node IN nodes(path) WHERE resources[node.name] IS NOT NULL)
      AND ALL(i IN range(0, size(nodes(path)) - 2)
              WHERE NOT nodes(path)[i] IN nodes(path)[(i + 1)..])
    WITH reduce(sum = 0.0, node IN nodes(path) | sum + resources[node.name])
           / size(nodes(path)) AS weight,
         [node IN nodes(path) | {
           name: node.name,
           type: node.type,
           description: node.description,
           activation: resources[node.name]
         }] AS nodes,
         [i IN range(0, size(relationships(path)) - 1) | {
           relations: relationships(path)[i].relations,
           chunkIds: relationships(path)[i].chunkIds,
           forward: startNode(relationships(path)[i]) = nodes(path)[i]
         }] AS edges
    ORDER BY weight DESC
    LIMIT $topPaths
    RETURN collect({nodes: nodes, edges: edges, weight: weight}) AS paths
  }
  CALL (resources) {
    UNWIND keys(resources) AS name
    WITH name, resources[name] AS activation
    ORDER BY activation DESC
    LIMIT $topEntities
    MATCH (e:Entity {name: name})
    RETURN collect({
      name: e.name,
      type: e.type,
      description: e.description,
      activation: activation
    }) AS entities
  }
  RETURN seedNames, paths, entities
`;

/** `maxSteps` comes from validated config, never from model output. */
export function buildQasaQuery(maxSteps: number): string {
  return FIND_SEEDS + PROPAGATION_STEP.repeat(maxSteps) + COLLECT_RESULTS;
}
