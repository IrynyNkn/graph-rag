/**
 * v1 extraction prompt.
 *
 * Design notes (each rule traces to an observed failure of v0 on
 * qwen2.5:7b-instruct):
 *  - entity length cap + "no verbs" counterexample  -> v0 produced the entity
 *    "senior_engineer_on_platform_team", i.e. a whole predicate as one node;
 *  - banned vacuous relations                       -> v0 emitted relation "IS";
 *  - atomicity rule                                 -> v0 collapsed a sentence
 *    stating two facts into a single triple;
 *  - "natural form, no underscores"                 -> v0 invented snake_case
 *    entity names; surface normalisation is the code's job, not the model's;
 *  - active-voice preference                        -> v0 mixed OWNS / OWNED_BY,
 *    fragmenting the relation vocabulary and confusing edge direction;
 *  - the few-shot example is the strongest lever here: it demonstrates role /
 *    membership decomposition, pronoun resolution and one-sentence-many-triples
 *    far more reliably than prose rules do. Its entities are deliberately from
 *    an unrelated domain so the model cannot copy them into real output.
 *
 * Stage 3: the relation vocabulary is now grown across ingests instead of
 * reinvented per document. `knownTypes` comes from GraphService.getKnownRelationTypes()
 * — the graph itself, not a separate list — so it always reflects what's
 * actually already there. This is *soft* enforcement (strong prompt wording +
 * no rejection of new types, not a JSON-schema enum): Ollama's `format:
 * 'json'` isn't grammar-constrained decoding here, and a hard enum would
 * block a genuinely new relation type from ever being proposed at all. A new
 * type the model proposes is simply written to the graph and becomes "known"
 * for the next ingest — see ingest.service.ts. `normaliseRelation` still runs
 * after this on the output; it only catches casing/spacing, not synonyms
 * like MANAGES vs IS_MANAGER_OF, which is what this list is for.
 */
export function buildExtractionPrompt(text: string, knownTypes: string[]): string {
  const knownTypesBlock =
    knownTypes.length > 0
      ? `Relation types already used elsewhere in this graph: ${knownTypes.join(', ')}.
Reuse one of these whenever it genuinely fits the fact, instead of inventing a
synonym for a relation that already has a name (e.g. do not write IS_MANAGER_OF
if MANAGES is already in the list above and fits). Only introduce a new type
when none of the existing ones fit the fact.`
      : `No relation types exist in the graph yet — this is the first document.
Introduce whatever specific types the text needs, following the naming rules below.`;

  return `You are an information extraction system. You extract a knowledge graph from text.

Return ONLY a JSON object of this exact shape:
{ "triples": [ { "subject": "...", "relation": "...", "object": "..." } ] }

ENTITIES ("subject" and "object"):
- An entity is a noun phrase naming ONE thing: a person, team, organisation, system, product, place, role, or concept.
- Write it in its natural form as it appears in the text. No underscores, no snake_case.
- At most 4 words. An entity is never a clause.
- An entity must NEVER contain a verb or a relation word. For example "senior engineer on the Platform team" is WRONG: that is two entities ("senior engineer", "Platform team") joined by relations.
- Resolve pronouns. If the text says "he", "she", "it" or "they", use the entity that pronoun refers to.

RELATIONS:
- "relation" is a specific verb phrase in UPPER_SNAKE_CASE, for example: MANAGES, REPORTS_TO, MEMBER_OF, HAS_ROLE, RESPONSIBLE_FOR, DEPENDS_ON, OWNS, PART_OF, LOCATED_IN.
- NEVER use vague relations such as IS, HAS, RELATED_TO or ASSOCIATED_WITH. Always choose a specific verb.
- Prefer active voice so the direction reads naturally: use { "subject": "Growth team", "relation": "OWNS", "object": "Payments service" } rather than the passive OWNED_BY form.

${knownTypesBlock}

FACTS:
- Each triple states exactly ONE atomic fact. A sentence stating several facts becomes several triples.
- Use only what the text states explicitly. Never infer, never add outside knowledge.
- If the text states no factual relations, return { "triples": [] }.

EXAMPLE

Example input:
Olena is a staff designer in the Atlas guild. She reports to Petro, who leads the Checkout department.

Example output:
{ "triples": [
  { "subject": "Olena", "relation": "HAS_ROLE", "object": "staff designer" },
  { "subject": "Olena", "relation": "MEMBER_OF", "object": "Atlas guild" },
  { "subject": "Olena", "relation": "REPORTS_TO", "object": "Petro" },
  { "subject": "Petro", "relation": "MANAGES", "object": "Checkout department" }
] }

TEXT TO EXTRACT FROM:
"""
${text}
"""

Return only the JSON object.`;
}

/**
 * Entity resolution confirmation (Stage 3). Deliberately asymmetric
 * context: the new name just came out of extraction and has no edges yet,
 * so there's nothing to describe it with; the existing candidate usually
 * does (its embeddingText, built from real edges — see describe.ts), so the
 * model judges against actual known facts instead of two bare strings. Two
 * bare strings alone can't tell "Acme Corp" from "Acme Industries"; grounded
 * context at least gives the model a chance to.
 */
export function buildEntityResolutionPrompt(
  newName: string,
  candidateName: string,
  candidateContext: string | null,
): string {
  return `You are deciding whether two names refer to the same real-world entity in a knowledge graph.

NEW NAME (just extracted from a document; no other context is available yet): "${newName}"

EXISTING ENTITY ALREADY IN THE GRAPH: "${candidateName}"
What is already known about it: ${candidateContext ?? '(nothing is known about it yet)'}

Return ONLY a JSON object of this exact shape:
{ "sameEntity": true } or { "sameEntity": false }

RULES:
- Answer true only if you are confident the two names refer to the same real-world thing — e.g. "Acme" and "Acme Corp" are very likely the same company.
- Answer false if they merely share a word but are plausibly different things — e.g. "Acme Corp" and "Acme Industries" despite sharing "Acme".
- When genuinely unsure, answer false. Merging two different entities into one is worse than leaving two nodes for the same one.

Return only the JSON object.`;
}
