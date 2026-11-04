import { InvalidModelOutputError, ModelUnavailableError } from '@graph-rag/inference';
import { FakeChatModel } from '@graph-rag/testing';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../../test/test-config.js';
import type { ExtractedEntity } from '../extraction/extraction.js';
import { isPlausibleAlias } from './alias-filter.js';
import { EntityCandidateRepository, type EntityCandidate } from './entity-candidate.repository.js';
import { EntityResolver } from './entity-resolver.js';

const person = (name: string, description = 'Someone.'): ExtractedEntity => ({
  name,
  type: 'PERSON',
  description,
});

class FakeCandidates extends EntityCandidateRepository {
  readonly lookups: string[] = [];

  constructor(private readonly known: EntityCandidate[]) {
    super();
  }

  async findExistingNames(names: string[]): Promise<Set<string>> {
    const knownNames = new Set(this.known.map((entity) => entity.name));
    return new Set(names.filter((name) => knownNames.has(name)));
  }

  async findCandidates(name: string, limit: number): Promise<EntityCandidate[]> {
    this.lookups.push(name);
    return this.known.slice(0, limit);
  }
}

describe('isPlausibleAlias', () => {
  it.each([
    ['owen', 'owen blackwood', true],
    ['owen blackwood', 'owen', true],
    ['data lake', 'datalake', true],
    ['owen blackwood', 'owen kessler', false],
  ])('%s and %s: %s', (first, second, expected) => {
    expect(isPlausibleAlias(person(first), person(second))).toBe(expected);
  });

  it('requires the same type', () => {
    expect(isPlausibleAlias(person('owen'), { ...person('owen blackwood'), type: 'TEAM' })).toBe(
      false,
    );
  });

  it('does not match a name with itself', () => {
    expect(isPlausibleAlias(person('owen'), person('owen'))).toBe(false);
  });
});

describe('EntityResolver', () => {
  const extraction = {
    entities: [person('owen')],
    triples: [{ subject: 'owen', relation: 'manages', object: 'search team' }],
  };

  function createResolver(known: EntityCandidate[], reply: unknown) {
    const candidates = new FakeCandidates(known);
    const chat = new FakeChatModel(() => reply);
    return { resolver: new EntityResolver(candidates, chat, testConfig()), candidates, chat };
  }

  it('renames a confirmed alias everywhere, merging duplicates', async () => {
    const { resolver } = createResolver([person('owen blackwood')], {
      reasoning: 'Same.',
      sameEntity: true,
    });

    const result = await resolver.resolve({
      entities: [person('owen'), person('owen blackwood', 'Manages search.')],
      triples: [
        { subject: 'owen', relation: 'manages', object: 'search team' },
        { subject: 'owen', relation: 'knows', object: 'owen blackwood' },
      ],
    });

    expect(result.entities.map((entity) => entity.name)).toEqual(['owen blackwood', 'search team']);
    expect(result.triples).toEqual([
      { subject: 'owen blackwood', relation: 'manages', object: 'search team' },
    ]);
  });

  it('keeps a name the model rejects', async () => {
    const { resolver } = createResolver([person('owen blackwood')], {
      reasoning: 'Different.',
      sameEntity: false,
    });

    await expect(resolver.resolve(extraction)).resolves.toEqual(extraction);
  });

  it('skips the model for implausible candidates', async () => {
    const { resolver, chat } = createResolver([person('diana kessler')], {
      reasoning: 'Same.',
      sameEntity: true,
    });

    await expect(resolver.resolve(extraction)).resolves.toEqual(extraction);
    expect(chat.requests).toEqual([]);
  });

  it('skips the lookup for a name already in the graph', async () => {
    const { resolver, candidates } = createResolver([person('owen')], {
      reasoning: 'Same.',
      sameEntity: true,
    });

    await resolver.resolve(extraction);

    expect(candidates.lookups).toEqual([]);
  });

  it('fails closed on invalid model output', async () => {
    const { resolver } = createResolver(
      [person('owen blackwood')],
      new InvalidModelOutputError('not JSON'),
    );

    await expect(resolver.resolve(extraction)).resolves.toEqual(extraction);
  });

  it('propagates an unavailable provider, because the job has to stop', async () => {
    const { resolver } = createResolver(
      [person('owen blackwood')],
      new ModelUnavailableError('down'),
    );

    await expect(resolver.resolve(extraction)).rejects.toThrow(ModelUnavailableError);
  });

  it('shows the model both names and what is known about them', async () => {
    const { resolver, chat } = createResolver(
      [person('owen blackwood', 'Manages the Search Team.')],
      { reasoning: 'Different.', sameEntity: false },
    );

    await resolver.resolve(extraction);

    expect(chat.lastPrompt).toContain('"owen" (PERSON)');
    expect(chat.lastPrompt).toContain('Manages the Search Team.');
  });

  it('says when nothing is known about a candidate', async () => {
    const { resolver, chat } = createResolver([person('owen blackwood', '')], {
      reasoning: 'Different.',
      sameEntity: false,
    });

    await resolver.resolve(extraction);

    expect(chat.lastPrompt).toContain('Nothing else is known');
  });
});
