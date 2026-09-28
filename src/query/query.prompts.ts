import type { Subgraph } from '../graph/graph.types.js';

/**
 * v1. v0 returned { "entities": [] } deterministically for "Who is responsible
 * for billing?" — the phrase "a person, team, system, concept" anchored the
 * model on proper nouns, so a common noun like "billing" was not counted as an
 * entity. The worked examples below break that anchor; the second one also
 * shows that a question may carry more than one lookup key.
 *
 * Since Stage 1, these phrases are no longer matched by exact string against
 * node names — each is embedded and matched via the Neo4j vector index
 * (QueryService.findSeedNodes), which absorbs morphological and synonym
 * mismatches exact matching couldn't. The extraction rules above still
 * matter just as much: a phrase that's never extracted can't be embedded.
 */
export function buildEntityExtractionPrompt(question: string): string {
  return `Extract the lookup keys from a question so they can be matched against nodes in a knowledge graph.

Return ONLY a JSON object of this exact shape:
{ "entities": ["...", "..."] }

RULES:
- Include every noun phrase the question mentions that could name a node: people, teams, systems, products, roles, and common nouns such as "billing" or "onboarding".
- Include a person's name even when the question asks who that person is or what they do.
- Drop only the interrogative words themselves ("who", "what", "which", "how many"). Never drop the entity standing next to them.
- Strip possessives down to the entity: "Ihor's role" gives "Ihor" and "role".
- Do NOT include question verbs or relation words ("responsible", "manages", "depends").
- Keep each key short: at most 4 words, in its natural form.
- When unsure whether something is a key, INCLUDE it. A key matching no node costs nothing; a missing key loses the answer.
- If the question names nothing lookup-able, return { "entities": [] }.

EXAMPLES

Question: Who is responsible for billing?
{ "entities": ["billing"] }

Question: Who is Olena?
{ "entities": ["Olena"] }

Question: What is Petro's role?
{ "entities": ["Petro", "role"] }

Question: How does the Atlas guild handle onboarding?
{ "entities": ["Atlas guild", "onboarding"] }

QUESTION:
"""
${question}
"""

Return only the JSON object.`;
}

/** Grounding instruction is deliberate: with no facts the model must abstain
 *  rather than fill the gap from its weights. */
export function buildAnswerPrompt(question: string, subgraph: Subgraph): string {
  const facts =
    subgraph.edges
      .map((e) => `(${e.source}) -[${e.relation}]-> (${e.target})`)
      .join('\n') || '(no facts found)';

  return `Answer the question using ONLY the facts below.
If the facts are not enough to answer, say you don't know. Do not use outside knowledge.

Facts:
${facts}

Question: ${question}`;
}
