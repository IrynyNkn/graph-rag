import { FakeChatModel } from '@graph-rag/testing';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../../test/test-config.js';
import type { DocumentChunk } from '../chunking/document-chunker.js';
import { normalizeExtraction } from './extraction-normalizer.js';
import { TripleExtractor } from './triple-extractor.js';

const entity = (name: string, description = 'A description.') => ({
  name,
  type: 'PERSON' as const,
  description,
});

describe('normalizeExtraction', () => {
  it('normalizes names and relations', () => {
    const result = normalizeExtraction({
      entities: [entity('  Alice   Smith '), entity('The Team')],
      triples: [{ subject: 'Alice Smith', relation: ' Works  In ', object: 'the team' }],
    });

    expect(result.entities.map((item) => item.name)).toEqual(['alice smith', 'team']);
    expect(result.triples).toEqual([
      { subject: 'alice smith', relation: 'works in', object: 'team' },
    ]);
  });

  it('merges duplicates and keeps the first description that says something', () => {
    const result = normalizeExtraction({
      entities: [
        entity('Alice', ''),
        entity('alice', 'Leads the team.'),
        entity('ALICE', 'Other.'),
      ],
      triples: [],
    });

    expect(result.entities).toEqual([entity('alice', 'Leads the team.')]);
  });

  it('drops self-loops, empty relations and repeated triples', () => {
    const result = normalizeExtraction({
      entities: [entity('a'), entity('b')],
      triples: [
        { subject: 'a', relation: 'knows', object: 'a' },
        { subject: 'a', relation: ' ', object: 'b' },
        { subject: 'a', relation: 'knows', object: 'b' },
        { subject: 'A', relation: 'KNOWS', object: 'B' },
      ],
    });

    expect(result.triples).toEqual([{ subject: 'a', relation: 'knows', object: 'b' }]);
  });

  it('adds an endpoint the model forgot to list', () => {
    const result = normalizeExtraction({
      entities: [entity('a')],
      triples: [{ subject: 'a', relation: 'owns', object: 'b' }],
    });

    expect(result.entities).toContainEqual({ name: 'b', type: 'CONCEPT', description: '' });
  });

  it('drops names that are really clauses, with their triples', () => {
    const clause = 'the person who manages the whole team in the north office';

    const result = normalizeExtraction({
      entities: [entity(clause), entity('a')],
      triples: [{ subject: 'a', relation: 'reports to', object: clause }],
    });

    expect(result).toEqual({ entities: [entity('a')], triples: [] });
  });

  it('drops a triple whose unlisted endpoint is a fragment of a sentence', () => {
    const result = normalizeExtraction({
      entities: [entity('billing engine')],
      triples: [
        {
          subject: 'billing engine',
          relation: 'causes',
          object: 'triggers page to payments council',
        },
      ],
    });

    expect(result).toEqual({ entities: [entity('billing engine')], triples: [] });
  });

  it('trusts a longer name when the model listed it as an entity', () => {
    const name = 'bank of the sovereign military order';

    const result = normalizeExtraction({
      entities: [entity('a'), entity(name)],
      triples: [{ subject: 'a', relation: 'uses', object: name }],
    });

    expect(result.triples).toHaveLength(1);
  });

  it('is safe to apply twice', () => {
    const once = normalizeExtraction({
      entities: [entity('The Team')],
      triples: [{ subject: 'The Team', relation: 'Owns', object: 'Billing' }],
    });

    expect(normalizeExtraction(once)).toEqual(once);
  });
});

describe('TripleExtractor', () => {
  const chunk: DocumentChunk = {
    ordinal: 0,
    text: 'Alice manages the team.',
    headingPath: ['People', 'Managers'],
  };

  it('asks for structured output and normalizes it', async () => {
    const chat = new FakeChatModel(() => ({
      entities: [entity('Alice')],
      triples: [],
    }));
    const extractor = new TripleExtractor(chat, testConfig());

    const result = await extractor.extract(chunk, 'handbook.md');

    expect(result.entities[0]?.name).toBe('alice');
    expect(chat.requests[0]).toMatchObject({ temperature: 0, maxOutputTokens: 2500 });
  });

  it('gives the model the document and the heading path', async () => {
    const chat = new FakeChatModel(() => ({ entities: [], triples: [] }));

    await new TripleExtractor(chat, testConfig()).extract(chunk, 'handbook.md');

    expect(chat.lastPrompt).toContain('Document: handbook.md');
    expect(chat.lastPrompt).toContain('Section: People > Managers');
    expect(chat.lastPrompt).toContain('Alice manages the team.');
  });

  it('leaves the section out when there is none', async () => {
    const chat = new FakeChatModel(() => ({ entities: [], triples: [] }));

    await new TripleExtractor(chat, testConfig()).extract({ ...chunk, headingPath: [] }, 'a.txt');

    expect(chat.lastPrompt).not.toContain('Section:');
  });
});
