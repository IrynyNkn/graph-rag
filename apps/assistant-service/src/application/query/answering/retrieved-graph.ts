import type { GraphEdge, GraphNode, RetrievedGraph } from '@graph-rag/contracts';
import type { ActivatedEntity, RetrievalResult, RetrievedPath } from '../retrieval/retriever.js';

/** What the UI draws: node size comes from activation, edge width from weight. */
export function toRetrievedGraph(retrieval: RetrievalResult): RetrievedGraph {
  return { nodes: collectNodes(retrieval), edges: collectEdges(retrieval.paths) };
}

function collectNodes({ seedNames, paths, entities }: RetrievalResult): GraphNode[] {
  const seeds = new Set(seedNames);
  const nodes = new Map<string, GraphNode>();
  const add = (entity: ActivatedEntity) => {
    nodes.set(entity.name, { ...entity, isSeed: seeds.has(entity.name) });
  };
  paths.forEach((path) => path.nodes.forEach(add));
  // An activated entity off every kept path would float unconnected, and says nothing on its own.
  entities.filter((entity) => seeds.has(entity.name)).forEach(add);
  return [...nodes.values()];
}

function collectEdges(paths: RetrievedPath[]): GraphEdge[] {
  const edges = new Map<string, GraphEdge>();
  for (const path of paths) {
    path.edges.forEach((edge, index) => {
      const from = path.nodes[index]?.name ?? '';
      const to = path.nodes[index + 1]?.name ?? '';
      const [source, target] = edge.forward ? [from, to] : [to, from];
      const key = JSON.stringify([source, target]);
      const existing = edges.get(key);
      edges.set(key, {
        source,
        target,
        relations: [...new Set(edge.relations)],
        chunkIds: [...new Set(edge.chunkIds)],
        weight: Math.max(existing?.weight ?? 0, path.weight),
      });
    });
  }
  return [...edges.values()];
}
