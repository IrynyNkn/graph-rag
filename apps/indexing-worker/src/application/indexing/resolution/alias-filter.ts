import type { ExtractedEntity } from '../extraction/extraction.js';
import type { EntityCandidate } from './entity-candidate.repository.js';

/**
 * Only plausible pairs reach the model, because every pair costs a call: the same type, and one
 * name contained in the other ("owen" and "owen blackwood") or equal without spaces.
 */
export function isPlausibleAlias(entity: ExtractedEntity, candidate: EntityCandidate): boolean {
  if (entity.type !== candidate.type || entity.name === candidate.name) {
    return false;
  }
  return (
    withoutSpaces(entity.name) === withoutSpaces(candidate.name) ||
    isTokenSubset(entity.name, candidate.name) ||
    isTokenSubset(candidate.name, entity.name)
  );
}

function withoutSpaces(name: string): string {
  return name.replaceAll(' ', '');
}

function isTokenSubset(shorter: string, longer: string): boolean {
  const tokens = new Set(longer.split(' '));
  return shorter.split(' ').every((token) => tokens.has(token));
}
