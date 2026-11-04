import { Embedder } from '@graph-rag/inference';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config.js';
import { buildEmbeddingText, buildEntityDescription } from './entity-description.js';
import {
  KnowledgeRepository,
  type RefreshedEntity,
  type StaleEntity,
} from './knowledge.repository.js';

interface PendingUpdate {
  entity: StaleEntity;
  description: string;
}

/**
 * Brings derived entity data up to date. It runs once at the end of a job, because embedding
 * after every chunk would repeat work. Staleness is stored in the graph, so it survives a crash.
 */
@Injectable()
export class KnowledgeRefresher {
  constructor(
    private readonly knowledge: KnowledgeRepository,
    private readonly embedder: Embedder,
    private readonly config: AppConfig,
  ) {}

  async refresh(): Promise<void> {
    await this.knowledge.deleteOrphans();
    const { batchSize } = this.config.refresh;
    let batch = await this.knowledge.findStale(batchSize);
    while (batch.length > 0) {
      await this.knowledge.saveRefreshed(await this.refreshBatch(batch));
      batch = await this.knowledge.findStale(batchSize);
    }
  }

  private async refreshBatch(batch: StaleEntity[]): Promise<RefreshedEntity[]> {
    const updates = batch.map((entity) => this.toUpdate(entity));
    const embeddings = await this.embedChanged(updates);
    return updates.map(({ entity, description }) => ({
      name: entity.name,
      revision: entity.revision,
      description,
      embedding: embeddings.get(entity.name) ?? null,
    }));
  }

  private toUpdate(entity: StaleEntity): PendingUpdate {
    const { descriptionMaxChars } = this.config.refresh;
    return { entity, description: buildEntityDescription(entity.mentions, descriptionMaxChars) };
  }

  private async embedChanged(updates: PendingUpdate[]): Promise<Map<string, number[]>> {
    const changed = updates.filter(
      ({ entity, description }) => !entity.hasEmbedding || entity.description !== description,
    );
    if (changed.length === 0) {
      return new Map();
    }
    const vectors = await this.embedder.embedDocuments(
      changed.map(({ entity, description }) => buildEmbeddingText(entity.name, description)),
    );
    return new Map(
      vectors.flatMap((vector, index) => {
        const update = changed[index];
        return update ? [[update.entity.name, vector] as const] : [];
      }),
    );
  }
}
