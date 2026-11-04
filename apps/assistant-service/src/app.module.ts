import { GraphStoreModule } from '@graph-rag/graph-store';
import { InferenceModule } from '@graph-rag/inference';
import { AppErrorFilter, HealthController } from '@graph-rag/nest-common';
import { RelationalStoreModule } from '@graph-rag/relational-store';
import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConversationRepository } from './application/conversations/conversation.repository.js';
import { ConversationsService } from './application/conversations/conversations.service.js';
import { HistoryLoader } from './application/conversations/history-loader.js';
import { QueryAnalyzer } from './application/query/analysis/query-analyzer.js';
import {
  ANSWER_STRATEGIES,
  type AnswerStrategy,
} from './application/query/answering/answer-strategy.js';
import { ContextBuilder } from './application/query/answering/context-builder.js';
import { ConversationAnswerStrategy } from './application/query/answering/conversation-answer.strategy.js';
import { KnowledgeBaseAnswerStrategy } from './application/query/answering/knowledge-base-answer.strategy.js';
import { SourceChunkRepository } from './application/query/answering/source-chunk.repository.js';
import { QasaGraphRepository } from './application/query/retrieval/qasa-graph.repository.js';
import { QasaRetriever } from './application/query/retrieval/qasa-retriever.js';
import { QueryEntityExtractor } from './application/query/retrieval/query-entity-extractor.js';
import { Retriever } from './application/query/retrieval/retriever.js';
import { TurnService } from './application/turns/turn.service.js';
import { AppConfig } from './config.js';
import { GraphQasaRepository } from './infrastructure/repositories/graph-qasa.repository.js';
import { GraphSourceChunkRepository } from './infrastructure/repositories/graph-source-chunk.repository.js';
import { RelationalConversationRepository } from './infrastructure/repositories/relational-conversation.repository.js';
import { ConversationsController } from './presentation/conversations.controller.js';
import { TurnsController } from './presentation/turns.controller.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        RelationalStoreModule.forRoot({ connectionString: config.postgresUrl }),
        GraphStoreModule.forRoot({
          ...config.neo4j,
          embeddingDimension: config.inference.embedding.dimension,
        }),
        InferenceModule.forRoot(config.inference),
      ],
      controllers: [ConversationsController, TurnsController, HealthController],
      providers: [
        { provide: AppConfig, useValue: config },
        { provide: APP_FILTER, useClass: AppErrorFilter },
        { provide: ConversationRepository, useClass: RelationalConversationRepository },
        { provide: QasaGraphRepository, useClass: GraphQasaRepository },
        { provide: SourceChunkRepository, useClass: GraphSourceChunkRepository },
        { provide: Retriever, useClass: QasaRetriever },
        {
          provide: ANSWER_STRATEGIES,
          inject: [KnowledgeBaseAnswerStrategy, ConversationAnswerStrategy],
          useFactory: (...strategies: AnswerStrategy[]) => strategies,
        },
        ConversationsService,
        HistoryLoader,
        QueryAnalyzer,
        QueryEntityExtractor,
        ContextBuilder,
        KnowledgeBaseAnswerStrategy,
        ConversationAnswerStrategy,
        TurnService,
      ],
    };
  }
}
