import { FakeEmbedder } from '@graph-rag/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/test-config.js';
import { buildEmbeddingText, buildEntityDescription } from './entity-description.js';
import { KnowledgeRefresher } from './knowledge-refresher.js';
import {
  KnowledgeRepository,
  type RefreshedEntity,
  type StaleEntity,
} from './knowledge.repository.js';

class FakeKnowledgeRepository extends KnowledgeRepository {
  stale: StaleEntity[] = [];
  readonly saved: RefreshedEntity[] = [];
  orphanRuns = 0;

  async deleteOrphans(): Promise<void> {
    this.orphanRuns += 1;
  }

  async findStale(limit: number): Promise<StaleEntity[]> {
    return this.stale.slice(0, limit);
  }

  async saveRefreshed(entities: RefreshedEntity[]): Promise<void> {
    this.saved.push(...entities);
    const names = new Set(entities.map((entity) => entity.name));
    this.stale = this.stale.filter((entity) => !names.has(entity.name));
  }
}

const stale = (name: string, overrides: Partial<StaleEntity> = {}): StaleEntity => ({
  name,
  revision: 1,
  description: null,
  hasEmbedding: false,
  mentions: [`${name} is known.`],
  ...overrides,
});

describe('buildEntityDescription', () => {
  it('joins unique mentions in a stable order', () => {
    expect(buildEntityDescription(['b.', ' a. ', 'b.', ''], 100)).toBe('a. | b.');
  });

  it('stops before going over the limit', () => {
    expect(buildEntityDescription(['aaaa', 'bbbb', 'cccc'], 11)).toBe('aaaa | bbbb');
  });

  it('is empty when no mention says anything', () => {
    expect(buildEntityDescription(['', '  '], 100)).toBe('');
  });
});

describe('buildEmbeddingText', () => {
  it('leads with the name', () => {
    expect(buildEmbeddingText('alice', 'Leads the team.')).toBe('alice: Leads the team.');
  });

  it('falls back to the name alone', () => {
    expect(buildEmbeddingText('alice', '')).toBe('alice');
  });
});

describe('KnowledgeRefresher', () => {
  let repository: FakeKnowledgeRepository;
  let embedder: FakeEmbedder;
  let refresher: KnowledgeRefresher;

  beforeEach(() => {
    repository = new FakeKnowledgeRepository();
    embedder = new FakeEmbedder(3);
    refresher = new KnowledgeRefresher(
      repository,
      embedder,
      testConfig({ REFRESH_BATCH_SIZE: '2' }),
    );
  });

  it('deletes orphans even when nothing is stale', async () => {
    await refresher.refresh();

    expect(repository.orphanRuns).toBe(1);
    expect(embedder.documentBatches).toEqual([]);
  });

  it('builds the description, embeds it and keeps the revision it read', async () => {
    repository.stale = [stale('alice', { revision: 7 })];

    await refresher.refresh();

    expect(embedder.documentBatches).toEqual([['alice: alice is known.']]);
    expect(repository.saved).toEqual([
      {
        name: 'alice',
        revision: 7,
        description: 'alice is known.',
        embedding: expect.any(Array),
      },
    ]);
  });

  it('embeds in batches until nothing is stale', async () => {
    repository.stale = [stale('a'), stale('b'), stale('c')];

    await refresher.refresh();

    expect(embedder.documentBatches.map((batch) => batch.length)).toEqual([2, 1]);
    expect(repository.saved).toHaveLength(3);
  });

  it('does not embed again when the description did not change', async () => {
    repository.stale = [stale('alice', { description: 'alice is known.', hasEmbedding: true })];

    await refresher.refresh();

    expect(embedder.documentBatches).toEqual([]);
    expect(repository.saved[0]).toMatchObject({ description: 'alice is known.', embedding: null });
  });

  it('embeds an unchanged description that has no embedding yet', async () => {
    repository.stale = [stale('alice', { description: 'alice is known.', hasEmbedding: false })];

    await refresher.refresh();

    expect(repository.saved[0]?.embedding).not.toBeNull();
  });

  it('embeds when the description changed', async () => {
    repository.stale = [stale('alice', { description: 'Old text.', hasEmbedding: true })];

    await refresher.refresh();

    expect(repository.saved[0]?.embedding).not.toBeNull();
  });
});
