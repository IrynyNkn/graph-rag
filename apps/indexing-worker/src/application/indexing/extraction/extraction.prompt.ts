import type { ChatMessage } from '@graph-rag/inference';
import type { DocumentChunk } from '../chunking/document-chunker.js';
import { ENTITY_TYPES, type EntityType } from './extraction.js';

const ENTITY_TYPE_MEANINGS: Record<EntityType, string> = {
  PERSON: 'a named individual',
  ORGANIZATION: 'a company, institution or department',
  TEAM: 'a named group of people inside an organization',
  SYSTEM: 'a software system, service, product or tool',
  PROJECT: 'a named project or initiative',
  LOCATION: 'a named place',
  EVENT: 'a named event or incident',
  WORK: 'a publication, film, book or other creative work',
  CONCEPT: 'a named idea, risk, policy, role or technology',
};

const INSTRUCTIONS = `You are a knowledge graph specialist. Extract named entities and the relationships between them from the text.

Entity types:
${ENTITY_TYPES.map((type) => `- ${type}: ${ENTITY_TYPE_MEANINGS[type]}`).join('\n')}

Rules:
- Use the full name as written in the text. Never use pronouns or generic terms such as "the company".
- A name is a short noun phrase, never a clause.
- description: one sentence about the entity, based only on this text.
- Each triple must use names from the entities list as subject and object.
- relation: a short lowercase verb phrase in active voice, such as "manages" or "depends on". Avoid vague relations such as "is" or "related to".
- One triple per fact. A sentence with several facts gives several triples.
- Use only facts stated in the text. Add nothing from outside knowledge.
- If the text names nothing, return empty lists.

Return only a JSON object with the fields "entities" (name, type, description) and "triples" (subject, relation, object).`;

export function buildExtractionMessages(chunk: DocumentChunk, documentName: string): ChatMessage[] {
  const context = [`Document: ${documentName}`];
  if (chunk.headingPath.length > 0) {
    context.push(`Section: ${chunk.headingPath.join(' > ')}`);
  }
  return [
    { role: 'system', content: INSTRUCTIONS },
    { role: 'user', content: `${context.join('\n')}\n\nText:\n${chunk.text}` },
  ];
}
