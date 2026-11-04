import { documentJobSchema, JobQueues } from '@graph-rag/contracts';
import { JobConsumer } from '@graph-rag/job-queue';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { IndexingService } from '../application/indexing/indexing.service.js';
import { RemovalService } from '../application/removal/removal.service.js';

@Injectable()
export class DocumentJobsConsumer implements OnApplicationBootstrap {
  constructor(
    private readonly jobs: JobConsumer,
    private readonly indexing: IndexingService,
    private readonly removal: RemovalService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.jobs.consume(JobQueues.indexDocument, documentJobSchema, (job) =>
      this.indexing.index(job.documentId),
    );
    await this.jobs.consume(JobQueues.removeDocument, documentJobSchema, (job) =>
      this.removal.handleJob(job.documentId),
    );
  }
}
