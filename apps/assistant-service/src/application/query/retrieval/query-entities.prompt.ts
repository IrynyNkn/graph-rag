import type { ChatMessage } from '@graph-rag/inference';

const INSTRUCTIONS = `Extract the things a question asks about, so they can be looked up in a knowledge graph.

For each one return:
- name: the name as written in the question, lowercase.
- searchHint: the name plus one or two words from the question that disambiguate it, for example "uhf film" or "titanic ship".

Rules:
- Include people, teams, organizations, places, systems, products, projects, events and works.
- Include common nouns that name a topic, such as "billing" or "onboarding".
- Do not include question words or relation words, such as "who", "what", "manages" or "depends".
- Do not include generic words on their own, such as "team", "person" or "company". The question "which team owns billing?" names only "billing".
- Always return at least one.

Return only a JSON object with the field "entities", a list of objects with "name" and "searchHint".`;

export function buildQueryEntitiesMessages(question: string): ChatMessage[] {
  return [
    { role: 'system', content: INSTRUCTIONS },
    { role: 'user', content: `Question: ${question}` },
  ];
}
