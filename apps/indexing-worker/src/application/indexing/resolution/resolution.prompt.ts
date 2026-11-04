import type { ChatMessage } from '@graph-rag/inference';
import type { ExtractedEntity } from '../extraction/extraction.js';
import type { EntityCandidate } from './entity-candidate.repository.js';

const INSTRUCTIONS = `You decide whether two names in a knowledge graph refer to the same real-world entity.

Compare them step by step, then decide:
- Same entity: one name is a short form of the other, or the longer one only adds a generic word such as "department", "inc" or a first name. Examples: "acme" and "acme corp", "platform" and "platform department", "blackwood" and "owen blackwood".
- Different entities: the extra words name something else, or the shorter name is only a generic word. Examples: "acme" and "acme billing", "team" and "checkout team".
- Different entities: the descriptions contradict each other.
- When unsure, they are different. Merging two different entities is worse than keeping a duplicate.

Return only a JSON object with "reasoning" (one short sentence comparing them) and "sameEntity" (true or false).`;

export function buildResolutionMessages(
  entity: ExtractedEntity,
  candidate: EntityCandidate,
): ChatMessage[] {
  return [
    { role: 'system', content: INSTRUCTIONS },
    {
      role: 'user',
      content: `First: "${entity.name}" (${entity.type}). ${describe(entity.description)}
Second: "${candidate.name}" (${candidate.type}). ${describe(candidate.description)}`,
    },
  ];
}

function describe(description: string): string {
  return description.length > 0 ? description : 'Nothing else is known about it.';
}
