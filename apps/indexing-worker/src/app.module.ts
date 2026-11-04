import { FileStoreModule } from '@graph-rag/file-store';
import { GraphStoreModule } from '@graph-rag/graph-store';
import { InferenceModule } from '@graph-rag/inference';
import { JobQueueModule } from '@graph-rag/job-queue';
import { RelationalStoreModule } from '@graph-rag/relational-store';
import { Module, type DynamicModule } from '@nestjs/common';
import { DocumentStatusRepository } from './application/document-status.repository.js';
import { ChunkIndexer } from './application/indexing/chunk-indexer.js';
import { ChunkRepository } from './application/indexing/chunk.repository.js';
import {
  CHUNKING_STRATEGIES,
  type ChunkingStrategy,
} from './application/indexing/chunking/chunking-strategy.js';
import { DocumentChunker } from './application/indexing/chunking/document-chunker.js';
import { HeadingChunkingStrategy } from './application/indexing/chunking/heading-chunking.strategy.js';
import { ParagraphChunkingStrategy } from './application/indexing/chunking/paragraph-chunking.strategy.js';
import { SlidingWindowChunkingStrategy } from './application/indexing/chunking/sliding-window-chunking.strategy.js';
import { TripleExtractor } from './application/indexing/extraction/triple-extractor.js';
import { IndexingService } from './application/indexing/indexing.service.js';
import {
  DOCUMENT_PARSERS,
  type DocumentParser,
} from './application/indexing/parsing/document-parser.js';
import { DocumentReader } from './application/indexing/parsing/document-reader.js';
import { EntityCandidateRepository } from './application/indexing/resolution/entity-candidate.repository.js';
import { EntityResolver } from './application/indexing/resolution/entity-resolver.js';
import { KnowledgeRefresher } from './application/knowledge/knowledge-refresher.js';
import { KnowledgeRepository } from './application/knowledge/knowledge.repository.js';
import { DocumentGraphRepository } from './application/removal/document-graph.repository.js';
import { RemovalService } from './application/removal/removal.service.js';
import { AppConfig } from './config.js';
import { MarkdownDocumentParser } from './infrastructure/parsers/markdown-document.parser.js';
import { PdfDocumentParser } from './infrastructure/parsers/pdf-document.parser.js';
import { TextDocumentParser } from './infrastructure/parsers/text-document.parser.js';
import { GraphChunkRepository } from './infrastructure/repositories/graph-chunk.repository.js';
import { GraphDocumentRepository } from './infrastructure/repositories/graph-document.repository.js';
import { GraphEntityCandidateRepository } from './infrastructure/repositories/graph-entity-candidate.repository.js';
import { GraphKnowledgeRepository } from './infrastructure/repositories/graph-knowledge.repository.js';
import { RelationalDocumentStatusRepository } from './infrastructure/repositories/relational-document-status.repository.js';
import { DocumentJobsConsumer } from './presentation/document-jobs.consumer.js';

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
        FileStoreModule.forRoot({ directory: config.fileStoreDirectory }),
        JobQueueModule.forRoot({ url: config.rabbitMqUrl }),
        InferenceModule.forRoot(config.inference),
      ],
      providers: [
        { provide: AppConfig, useValue: config },
        { provide: DocumentStatusRepository, useClass: RelationalDocumentStatusRepository },
        { provide: ChunkRepository, useClass: GraphChunkRepository },
        { provide: EntityCandidateRepository, useClass: GraphEntityCandidateRepository },
        { provide: KnowledgeRepository, useClass: GraphKnowledgeRepository },
        { provide: DocumentGraphRepository, useClass: GraphDocumentRepository },
        {
          provide: DOCUMENT_PARSERS,
          useFactory: (): DocumentParser[] => [
            new PdfDocumentParser(),
            new MarkdownDocumentParser(),
            new TextDocumentParser(),
          ],
        },
        {
          // Order is priority: the first strategy that supports a document wins.
          provide: CHUNKING_STRATEGIES,
          useFactory: (): ChunkingStrategy[] => [
            new HeadingChunkingStrategy(config.chunking.maxChars),
            new ParagraphChunkingStrategy(config.chunking.maxChars),
            new SlidingWindowChunkingStrategy(
              config.chunking.maxChars,
              config.chunking.overlapChars,
            ),
          ],
        },
        DocumentReader,
        DocumentChunker,
        TripleExtractor,
        EntityResolver,
        ChunkIndexer,
        KnowledgeRefresher,
        RemovalService,
        IndexingService,
        DocumentJobsConsumer,
      ],
    };
  }
}
