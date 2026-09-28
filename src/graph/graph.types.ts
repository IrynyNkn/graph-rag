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

/** A vector-search hit: a seed node that already cleared the similarity
 *  threshold, with its score kept around for logging/explainability rather
 *  than discarded once the filter has run. */
export interface SeedNode {
  name: string;
  score: number;
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
