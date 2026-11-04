import { FileStoreModule } from '@graph-rag/file-store';
import { JobQueueModule } from '@graph-rag/job-queue';
import { AppErrorFilter, HealthController } from '@graph-rag/nest-common';
import { RelationalStoreModule } from '@graph-rag/relational-store';
import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentRepository } from './application/document.repository.js';
import { DocumentsService } from './application/documents.service.js';
import type { AppConfig } from './config.js';
import { RelationalDocumentRepository } from './infrastructure/repositories/relational-document.repository.js';
import { DocumentsController } from './presentation/documents.controller.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        RelationalStoreModule.forRoot({ connectionString: config.postgresUrl }),
        FileStoreModule.forRoot({ directory: config.fileStoreDirectory }),
        JobQueueModule.forRoot({ url: config.rabbitMqUrl }),
        MulterModule.register({ limits: { fileSize: config.maxUploadBytes } }),
      ],
      controllers: [DocumentsController, HealthController],
      providers: [
        { provide: APP_FILTER, useClass: AppErrorFilter },
        { provide: DocumentRepository, useClass: RelationalDocumentRepository },
        DocumentsService,
      ],
    };
  }
}
