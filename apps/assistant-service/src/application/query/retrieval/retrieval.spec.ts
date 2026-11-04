import { InvalidModelOutputError, ModelUnavailableError } from '@graph-rag/inference';
import { FakeChatModel, FakeEmbedder } from '@graph-rag/testing';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../../test/test-config.js';
import { deduplicatePaths } from './path-deduplication.js';
import { QasaGraphRepository, type QasaActivation } from './qasa-graph.repository.js';
import { QasaRetriever } from './qasa-retriever.js';
import { QueryEntityExtractor } from './query-entity-extractor.js';
import type { RetrievalResult, RetrievedPath } from './retriever.js';

const path = (names: string[], weight = 1): RetrievedPath => ({
  nodes: names.map((name) => ({ name, type: null, description: null, activation: 1 })),
  edges: names.slice(1).map(() => ({ relations: ['r'], chunkIds: ['c'], forward: true })),
  weight,
});

const namesOf = (paths: RetrievedPath[]) => paths.map((item) => item.nodes.map((n) => n.name));

describe('deduplicatePaths', () => {
  it('keeps one of a chain found from both ends', () => {
    const result = deduplicatePaths([path(['a', 'b']), path(['b', 'a'])]);

    expect(namesOf(result)).toEqual([['a', 'b']]);
  });

  it('drops a prefix of a longer path', () => {
    const result = deduplicatePaths([path(['a', 'b']), path(['a', 'b', 'c'])]);

    expect(namesOf(result)).toEqual([['a', 'b', 'c']]);
  });

  it('drops a path whose reverse ends a longer path', () => {
    const result = deduplicatePaths([path(['c', 'b']), path(['a', 'b', 'c'])]);

    expect(namesOf(result)).toEqual([['a', 'b', 'c']]);
  });

  it('keeps paths that only overlap', () => {
    const paths = [path(['a', 'b']), path(['a', 'c'])];

    expect(namesOf(deduplicatePaths(paths))).toEqual([
      ['a', 'b'],
      ['a', 'c'],
    ]);
  });

  it('keeps the order of the paths', () => {
    const paths = [path(['x', 'y'], 2), path(['a', 'b'], 1)];

    expect(deduplicatePaths(paths).map((item) => item.weight)).toEqual([2, 1]);
  });
});

describe('QueryEntityExtractor', () => {
  it('normalizes names so they match the graph', async () => {
    const chat = new FakeChatModel(() => ({
      entities: [{ name: ' The Billing  Team ', searchHint: 'billing team' }],
    }));

    const entities = await new QueryEntityExtractor(chat, testConfig()).extract('Who runs it?');

    expect(entities).toEqual([{ name: 'billing team', searchHint: 'billing team' }]);
    expect(chat.lastPrompt).toContain('Who runs it?');
  });

  it.each([
    ['no entities', { entities: [] }],
    ['only empty names', { entities: [{ name: ' ', searchHint: 'x' }] }],
    ['invalid output', new InvalidModelOutputError('not JSON')],
  ])('searches by the whole question after %s', async (_case, reply) => {
    const chat = new FakeChatModel(() => reply);

    const entities = await new QueryEntityExtractor(chat, testConfig()).extract('Who is Alice?');

    expect(entities).toEqual([{ name: 'who is alice?', searchHint: 'Who is Alice?' }]);
  });

  it('propagates an unavailable provider', async () => {
    const chat = new FakeChatModel(() => new ModelUnavailableError('down'));

    await expect(new QueryEntityExtractor(chat, testConfig()).extract('Q')).rejects.toThrow(
      ModelUnavailableError,
    );
  });
});

describe('QasaRetriever', () => {
  class RecordingGraph extends QasaGraphRepository {
    activation: QasaActivation | null = null;

    constructor(private readonly result: RetrievalResult) {
      super();
    }

    async activate(activation: QasaActivation): Promise<RetrievalResult> {
      this.activation = activation;
      return this.result;
    }
  }

  it('seeds by search hints, gates by the question and removes duplicate paths', async () => {
    const hint = [1, 0, 0];
    const question = [0, 1, 0];
    const embedder = new FakeEmbedder(
      3,
      new Map([
        ['billing team', hint],
        ['Who runs billing?', question],
      ]),
    );
    const chat = new FakeChatModel(() => ({
      entities: [{ name: 'billing', searchHint: 'billing team' }],
    }));
    const graph = new RecordingGraph({
      seedNames: ['billing'],
      entities: [],
      paths: [path(['a', 'b']), path(['b', 'a'])],
    });
    const retriever = new QasaRetriever(
      new QueryEntityExtractor(chat, testConfig()),
      embedder,
      graph,
    );

    const result = await retriever.retrieve('Who runs billing?');

    expect(graph.activation).toEqual({
      seeds: [{ name: 'billing', embedding: hint }],
      questionEmbedding: question,
    });
    expect(result.paths).toHaveLength(1);
    expect(result.seedNames).toEqual(['billing']);
  });
});
