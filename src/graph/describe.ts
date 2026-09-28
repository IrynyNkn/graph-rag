import type { SubgraphEdge } from './graph.types.js';

/**
 * Turns a node's edges into text worth embedding (Stage 1 "option B" from
 * design discussion: description built by code from real edges, not written
 * by an LLM). Deterministic and free of extra model calls, so it can be
 * recomputed on every ingest without cost — and it can never hallucinate a
 * fact that isn't a real edge, which matters for a system whose value
 * proposition is explainability.
 *
 * Relation words come mechanically from the relation string itself
 * (MEMBER_OF -> "member of") rather than a hand-maintained verbalisation
 * table, because the relation vocabulary is still open (Stage 3 closes it
 * with a fixed enum). Direction is left as extracted (subject -> object)
 * even for edges where `name` is the object — an embedding model needs the
 * right words nearby, not grammatical polish.
 */
export function buildEntityDescription(name: string, edges: SubgraphEdge[]): string {
  const facts = edges.map(
    (e) => `${e.source} ${relationToWords(e.relation)} ${e.target}.`,
  );
  return [name, ...facts].join(' ');
}

function relationToWords(relation: string): string {
  return relation.toLowerCase().replace(/_/g, ' ');
}
