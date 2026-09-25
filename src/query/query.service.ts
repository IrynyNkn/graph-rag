import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { parseJsonSafe } from '../common/parse-json.js';
import { GraphService } from '../graph/graph.service.js';
import { normaliseName } from '../graph/normalise.js';
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

    const names = parsed.data.entities.map(normaliseName);
    const subgraph = await this.graph.getNeighborhood(names);

    const answer = await this.llm.generateText(
      buildAnswerPrompt(question, subgraph),
    );

    return { answer: answer.trim(), subgraph };
  }
}
