import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { parseJsonSafe } from '../common/parse-json.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { GraphService } from '../graph/graph.service.js';
import type { Subgraph } from '../graph/graph.types.js';
import { LlmService } from '../llm/llm.service.js';
import {
  buildAnswerPrompt,
  buildEntityExtractionPrompt,
} from './query.prompts.js';

const entitySchema = z.object({ entities: z.array(z.string().min(1)) });

export interface QueryResult {
  answer: string;
  /** Returned so the client can render the exact subgraph the answer used. */
  subgraph: Subgraph;
}

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly graph: GraphService,
    private readonly embedding: EmbeddingService,
    private readonly config: ConfigService,
  ) {}

  async query(question: string): Promise<QueryResult> {
    const rawEntities = await this.llm.generateText(
      buildEntityExtractionPrompt(question),
      { json: true },
    );

    const parsed = entitySchema.safeParse(parseJsonSafe(rawEntities));
    if (!parsed.success) {
      this.logger.warn(`Entity extraction rejected: ${parsed.error.message}`);
      throw new Error('Entity extraction failed: LLM output did not match schema');
    }

    const seedNames = await this.findSeedNodes(parsed.data.entities);
    const subgraph = await this.graph.getNeighborhood(seedNames);

    const answer = await this.llm.generateText(
      buildAnswerPrompt(question, subgraph),
    );

    return { answer: answer.trim(), subgraph };
  }

  /**
   * Stage 1 seed-node identification: embeds each extracted phrase
   * separately (not the whole question — filler words like "who"/"in our"
   * would dilute a single combined vector) and keeps every node whose score
   * against *any* phrase clears the threshold. Exact-name matching from
   * Stage 0 is gone; this absorbs plurals, synonyms and near-misses that
   * exact matching couldn't.
   */
  private async findSeedNodes(phrases: string[]): Promise<string[]> {
    const threshold = this.config.getOrThrow<number>(
      'embedding.similarityThreshold',
    );
    const bestScoreByName = new Map<string, number>();

    for (const phrase of phrases) {
      const vector = await this.embedding.embedQuery(phrase);
      const matches = await this.graph.findSeedNodesByVector(vector, threshold);
      for (const match of matches) {
        const best = bestScoreByName.get(match.name);
        if (best === undefined || match.score > best) {
          bestScoreByName.set(match.name, match.score);
        }
      }
    }

    this.logger.debug(
      `Seed nodes: ${JSON.stringify([...bestScoreByName.entries()])}`,
    );
    return [...bestScoreByName.keys()];
  }
}
