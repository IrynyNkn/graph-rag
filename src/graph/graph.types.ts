export interface Triple {
  subject: string;
  relation: string;
  object: string;
}

export interface SubgraphNode {
  name: string;
}

export interface SubgraphEdge {
  source: string;
  relation: string;
  target: string;
}

/**
 * The retrieval result shape. Consumed by two callers, so it must satisfy both:
 *  - QueryService flattens `edges` into text facts for the answer prompt;
 *  - the future UI renders `nodes` + `edges` as the graph panel on the right.
 */
export interface Subgraph {
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
}
