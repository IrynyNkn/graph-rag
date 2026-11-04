import { GraphStore } from '@graph-rag/graph-store';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import type { QasaSeed } from '../../src/application/query/retrieval/qasa-graph.repository.js';
import { GraphQasaRepository } from '../../src/infrastructure/repositories/graph-qasa.repository.js';
import { testConfig } from '../test-config.js';

const QUESTION = [1, 0, 0];

const FIXTURE = `
  UNWIND $entities AS entity
  CREATE (e:Entity {
    name: entity.name,
    type: 'CONCEPT',
    description: entity.name + ' description',
    revision: 1,
    refreshedRevision: 1
  })
  WITH e, entity
  CALL db.create.setNodeVectorProperty(e, 'descriptionEmbedding', entity.embedding)
`;

const RELATIONS = `
  UNWIND $relations AS relation
  MATCH (a:Entity {name: relation.from}), (b:Entity {name: relation.to})
  CREATE (a)-[:RELATES_TO {relations: relation.relations, chunkIds: relation.chunkIds}]->(b)
`;

describe('QASA query', () => {
  const { neo4j } = inject('stores');
  let graph: GraphStore;
  let repository: GraphQasaRepository;

  beforeAll(async () => {
    graph = new GraphStore({ ...neo4j, embeddingDimension: 3 });
    await graph.onModuleInit();
    repository = new GraphQasaRepository(graph, testConfig());
  });

  afterAll(async () => {
    await graph.onApplicationShutdown();
  });

  beforeEach(async () => {
    await graph.write('MATCH (n) DETACH DELETE n');
  });

  async function createFixture(): Promise<void> {
    await graph.write(FIXTURE, {
      entities: [
        { name: 'alice', embedding: [0.9, 0.1, 0] },
        { name: 'team', embedding: [0.6, 0.8, 0] },
        { name: 'billing', embedding: [0.8, 0.6, 0] },
        { name: 'bob', embedding: [0, 1, 0] },
      ],
    });
    await graph.write(RELATIONS, {
      relations: [
        { from: 'alice', to: 'team', relations: ['manages'], chunkIds: ['c1'] },
        {
          from: 'team',
          to: 'billing',
          relations: ['responsible for', 'owns'],
          chunkIds: ['c1', 'c2'],
        },
        { from: 'bob', to: 'team', relations: ['member of'], chunkIds: ['c3'] },
      ],
    });
  }

  const seed = (name: string, embedding = [0, 0, 1]): QasaSeed => ({ name, embedding });

  it('matches the hand-checked activation and gates out what is unrelated to the question', async () => {
    await createFixture();

    const result = await repository.activate({
      seeds: [seed('alice')],
      questionEmbedding: QUESTION,
    });

    // Step 1: team = 1 * 0.7 * 0.6 = 0.42.
    // Step 2: team += 0.42; billing = 0.42 * 0.7 * 0.8 = 0.2352; bob has similarity 0.
    // Step 3: team += 0.42; billing += 0.84 * 0.7 * 0.8 = 0.4704.
    const activation = new Map(result.entities.map((entity) => [entity.name, entity.activation]));
    expect(result.seedNames).toEqual(['alice']);
    expect(activation.get('alice')).toBeCloseTo(1, 5);
    expect(activation.get('team')).toBeCloseTo(1.26, 5);
    expect(activation.get('billing')).toBeCloseTo(0.7056, 5);
    expect(activation.has('bob')).toBe(false);
  });

  it('orders entities by activation', async () => {
    await createFixture();

    const { entities } = await repository.activate({
      seeds: [seed('alice')],
      questionEmbedding: QUESTION,
    });

    expect(entities.map((entity) => entity.name)).toEqual(['team', 'alice', 'billing']);
    expect(entities[0]).toMatchObject({ type: 'CONCEPT', description: 'team description' });
  });

  it('returns weighted paths with relations, chunk IDs and direction', async () => {
    await createFixture();

    const { paths } = await repository.activate({
      seeds: [seed('alice')],
      questionEmbedding: QUESTION,
    });

    const longest = paths.find((path) => path.nodes.length === 3);
    expect(longest?.nodes.map((node) => node.name)).toEqual(['alice', 'team', 'billing']);
    expect(longest?.weight).toBeCloseTo((1 + 1.26 + 0.7056) / 3, 5);
    expect(longest?.nodes[1]?.activation).toBeCloseTo(1.26, 5);
    expect(longest?.edges).toEqual([
      { relations: ['manages'], chunkIds: ['c1'], forward: true },
      { relations: ['responsible for', 'owns'], chunkIds: ['c1', 'c2'], forward: true },
    ]);
    expect(paths.map((path) => path.weight)).toEqual(
      paths.map((path) => path.weight).toSorted((a, b) => b - a),
    );
  });

  it('marks an edge walked against its direction', async () => {
    await createFixture();

    const { paths } = await repository.activate({
      seeds: [seed('team')],
      questionEmbedding: QUESTION,
    });

    const toAlice = paths.find((path) => path.nodes.at(-1)?.name === 'alice');
    expect(toAlice?.edges[0]?.forward).toBe(false);
  });

  it('seeds by vector when the name is not in the graph', async () => {
    await createFixture();

    const { seedNames, entities } = await repository.activate({
      seeds: [seed('no such name', [0, 1, 0])],
      questionEmbedding: QUESTION,
    });

    expect(seedNames).toContain('bob');
    expect(entities.map((entity) => entity.name)).toContain('bob');
  });

  it('skips nodes without an embedding, which are still waiting for the refresher', async () => {
    await createFixture();
    await graph.write(`
      MATCH (team:Entity {name: 'team'})
      CREATE (team)-[:RELATES_TO {relations: ['uses'], chunkIds: ['c9']}]->
             (:Entity {name: 'fresh', type: 'CONCEPT', revision: 1, refreshedRevision: 0})
    `);

    const { entities } = await repository.activate({
      seeds: [seed('alice')],
      questionEmbedding: QUESTION,
    });

    expect(entities.map((entity) => entity.name)).not.toContain('fresh');
  });

  it('returns nothing on an empty graph', async () => {
    const result = await repository.activate({
      seeds: [seed('alice')],
      questionEmbedding: QUESTION,
    });

    expect(result).toEqual({ seedNames: [], paths: [], entities: [] });
  });

  it('leaves no trace in the graph, so questions cannot disturb each other', async () => {
    await createFixture();

    await repository.activate({ seeds: [seed('alice')], questionEmbedding: QUESTION });

    const [row] = await graph.read(
      `MATCH (e:Entity) UNWIND keys(e) AS key WITH collect(DISTINCT key) AS keys RETURN keys`,
    );
    expect(row?.['keys']).not.toContain('resource');
    expect(row?.['keys']).not.toContain('_resource');
  });
});
