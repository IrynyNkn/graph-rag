import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  GraphStore,
  graphInt,
  isConstraintViolation,
  VectorIndexDimensionError,
} from '../src/index.js';

const DIMENSION = 3;

describe('GraphStore', () => {
  const { neo4j } = inject('stores');
  const opened: GraphStore[] = [];

  function open(embeddingDimension = DIMENSION): GraphStore {
    const store = new GraphStore({ ...neo4j, embeddingDimension });
    opened.push(store);
    return store;
  }

  let store: GraphStore;

  beforeAll(async () => {
    store = open();
    await store.onModuleInit();
  });

  afterAll(async () => {
    await Promise.all(opened.map((graph) => graph.onApplicationShutdown()));
  });

  it('is safe to start again', async () => {
    await expect(open().onModuleInit()).resolves.toBeUndefined();
  });

  it('refuses to start when the index has another dimension', async () => {
    await expect(open(DIMENSION + 1).onModuleInit()).rejects.toThrow(VectorIndexDimensionError);
  });

  it('returns integers as plain numbers and accepts them as integers', async () => {
    const rows = await store.read('UNWIND range(1, 5) AS n RETURN n LIMIT $limit', {
      limit: graphInt(2),
    });

    expect(rows).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('rolls a transaction back as a whole', async () => {
    await store.write('MATCH (n:Scratch) DELETE n');

    await expect(
      store.transaction(async (transaction) => {
        await transaction.run('CREATE (:Scratch)');
        throw new Error('undo');
      }),
    ).rejects.toThrow('undo');

    const [row] = await store.read('MATCH (n:Scratch) RETURN count(n) AS count');
    expect(row).toEqual({ count: 0 });
  });

  it('recognises the failure of a plain delete on a node with relationships', async () => {
    await store.write('CREATE (:Scratch)-[:LINK]->(:Scratch)');

    const error = await store.write('MATCH (n:Scratch) WITH n LIMIT 1 DELETE n').catch((e) => e);

    expect(isConstraintViolation(error)).toBe(true);
    await store.write('MATCH (n:Scratch) DETACH DELETE n');
  });

  it('rejects a second chunk with the same id', async () => {
    await store.write(`CREATE (:Chunk {id: 'graph-store-test'})`);

    await expect(store.write(`CREATE (:Chunk {id: 'graph-store-test'})`)).rejects.toThrow();

    await store.write(`MATCH (c:Chunk {id: 'graph-store-test'}) DELETE c`);
  });
});
