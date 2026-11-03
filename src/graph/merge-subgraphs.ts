import type { Subgraph, SubgraphEdge, SubgraphNode } from './graph.types.js';

/**
 * Stage 4: the agent may call the retrieval tool more than once per
 * question (Module 5's decomposition case — "compare X and Y" means two
 * separate tool calls, two separate Subgraphs). The explainability panel
 * needs the union of everything retrieved across the whole turn, not just
 * the last call's result — this is where that union happens, deduped by
 * node name and by (source, relation, target) edge identity so the same
 * fact surfacing from two overlapping tool calls doesn't render twice.
 */
export function mergeSubgraphs(subgraphs: Subgraph[]): Subgraph {
  const seenNodeNames = new Set<string>();
  const seenEdgeKeys = new Set<string>();
  const nodes: SubgraphNode[] = [];
  const edges: SubgraphEdge[] = [];

  for (const subgraph of subgraphs) {
    for (const node of subgraph.nodes) {
      if (!seenNodeNames.has(node.name)) {
        seenNodeNames.add(node.name);
        nodes.push(node);
      }
    }
    for (const edge of subgraph.edges) {
      const key = `${edge.source}|${edge.relation}|${edge.target}`;
      if (!seenEdgeKeys.has(key)) {
        seenEdgeKeys.add(key);
        edges.push(edge);
      }
    }
  }

  return { nodes, edges };
}
