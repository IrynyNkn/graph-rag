import { normalizeEntityName } from '@graph-rag/contracts';
import { ChatModel, InvalidModelOutputError } from '@graph-rag/inference';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '../../../config.js';
import { buildQueryEntitiesMessages } from './query-entities.prompt.js';

export interface QueryEntity {
  name: string;
  searchHint: string;
}

const queryEntitiesSchema = z.object({
  entities: z.array(z.object({ name: z.string(), searchHint: z.string() })),
});

@Injectable()
export class QueryEntityExtractor {
  private readonly logger = new Logger(QueryEntityExtractor.name);

  constructor(
    private readonly chat: ChatModel,
    private readonly config: AppConfig,
  ) {}

  /** Falls back to the whole question, which can still find seeds through vector search. */
  async extract(question: string): Promise<QueryEntity[]> {
    const entities = await this.askModel(question);
    return entities.length > 0
      ? entities
      : [{ name: normalizeEntityName(question), searchHint: question }];
  }

  private async askModel(question: string): Promise<QueryEntity[]> {
    try {
      const { entities } = await this.chat.completeStructured(
        {
          messages: buildQueryEntitiesMessages(question),
          temperature: 0,
          maxOutputTokens: this.config.qasa.queryEntitiesMaxOutputTokens,
        },
        queryEntitiesSchema,
      );
      return entities
        .map(({ name, searchHint }) => ({ name: normalizeEntityName(name), searchHint }))
        .filter(({ name }) => name.length > 0);
    } catch (error) {
      if (error instanceof InvalidModelOutputError) {
        this.logger.warn(`Searching by the whole question: ${error.message}`);
        return [];
      }
      throw error;
    }
  }
}
