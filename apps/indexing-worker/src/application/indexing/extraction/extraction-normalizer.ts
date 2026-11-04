import { normalizeEntityName } from '@graph-rag/contracts';
import type { ExtractedEntity, ExtractedTriple, Extraction } from './extraction.js';

// Longer "names" are clauses that a small model returned instead of an entity.
const MAX_NAME_WORDS = 8;
// A triple can name an entity the model forgot to list. Short ones are worth keeping, but long
// ones turned out to be fragments of a sentence, such as "triggers page to payments council".
const MAX_UNLISTED_NAME_WORDS = 4;
const TYPE_OF_UNLISTED_ENTITY = 'CONCEPT';

/** Safe to apply twice, which is how entity renames merge duplicates after resolution. */
export function normalizeExtraction(extraction: Extraction): Extraction {
  const entities = new Map<string, ExtractedEntity>();
  for (const entity of extraction.entities) {
    addEntity(entities, normalizeEntity(entity));
  }
  const triples = normalizeTriples(extraction.triples, new Set(entities.keys()));
  for (const triple of triples) {
    addEndpoint(entities, triple.subject);
    addEndpoint(entities, triple.object);
  }
  return { entities: [...entities.values()], triples };
}

function normalizeEntity(entity: ExtractedEntity): ExtractedEntity {
  return {
    name: normalizeEntityName(entity.name),
    type: entity.type,
    description: entity.description.trim(),
  };
}

function addEntity(entities: Map<string, ExtractedEntity>, entity: ExtractedEntity): void {
  if (entity.name.length === 0 || wordCount(entity.name) > MAX_NAME_WORDS) {
    return;
  }
  const existing = entities.get(entity.name);
  if (existing === undefined) {
    entities.set(entity.name, entity);
  } else if (existing.description.length === 0) {
    existing.description = entity.description;
  }
}

function addEndpoint(entities: Map<string, ExtractedEntity>, name: string): void {
  if (!entities.has(name)) {
    entities.set(name, { name, type: TYPE_OF_UNLISTED_ENTITY, description: '' });
  }
}

function normalizeTriples(triples: ExtractedTriple[], listed: Set<string>): ExtractedTriple[] {
  const unique = new Map<string, ExtractedTriple>();
  for (const triple of triples) {
    const normalized = normalizeTriple(triple);
    if (isValidTriple(normalized, listed)) {
      unique.set(JSON.stringify(normalized), normalized);
    }
  }
  return [...unique.values()];
}

function normalizeTriple(triple: ExtractedTriple): ExtractedTriple {
  return {
    subject: normalizeEntityName(triple.subject),
    relation: triple.relation.trim().toLowerCase().replace(/\s+/g, ' '),
    object: normalizeEntityName(triple.object),
  };
}

function isValidTriple(
  { subject, relation, object }: ExtractedTriple,
  listed: Set<string>,
): boolean {
  return (
    isValidEndpoint(subject, listed) &&
    isValidEndpoint(object, listed) &&
    subject !== object &&
    relation.length > 0
  );
}

function isValidEndpoint(name: string, listed: Set<string>): boolean {
  return listed.has(name) || (name.length > 0 && wordCount(name) <= MAX_UNLISTED_NAME_WORDS);
}

function wordCount(name: string): number {
  return name.split(' ').length;
}
