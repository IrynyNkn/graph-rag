export interface EntityCandidate {
  name: string;
  type: string;
  description: string;
}

export abstract class EntityCandidateRepository {
  abstract findExistingNames(names: string[]): Promise<Set<string>>;
  abstract findCandidates(name: string, limit: number): Promise<EntityCandidate[]>;
}
