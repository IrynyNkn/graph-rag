import { queryRouteSchema, type QueryRoute } from '@graph-rag/contracts';
import { ChatModel, InvalidModelOutputError } from '@graph-rag/inference';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '../../../config.js';
import {
  isEmptyHistory,
  type ConversationHistory,
} from '../../conversations/conversation-history.js';
import { buildAnalysisMessages } from './analysis.prompt.js';

export interface QueryAnalysis {
  route: QueryRoute;
  standaloneQuestion: string;
}

const analysisSchema = z.object({
  route: queryRouteSchema,
  standaloneQuestion: z.string().trim().min(1),
});

@Injectable()
export class QueryAnalyzer {
  private readonly logger = new Logger(QueryAnalyzer.name);

  constructor(
    private readonly chat: ChatModel,
    private readonly config: AppConfig,
  ) {}

  /** With no history there is nothing to reformulate or to answer from, so no model call. */
  async analyze(question: string, history: ConversationHistory): Promise<QueryAnalysis> {
    const fallback: QueryAnalysis = { route: 'knowledge_base', standaloneQuestion: question };
    if (isEmptyHistory(history)) {
      return fallback;
    }
    try {
      return await this.chat.completeStructured(
        {
          messages: buildAnalysisMessages(question, history),
          temperature: 0,
          maxOutputTokens: this.config.analysis.maxOutputTokens,
        },
        analysisSchema,
      );
    } catch (error) {
      if (error instanceof InvalidModelOutputError) {
        this.logger.warn(`Using the question as it is: ${error.message}`);
        return fallback;
      }
      throw error;
    }
  }
}
