import { FileStore } from '@graph-rag/file-store';
import { errorMessage } from '@graph-rag/nest-common';
import { Injectable, Logger } from '@nestjs/common';
import { DocumentStatusRepository } from '../document-status.repository.js';
import { KnowledgeRefresher } from '../knowledge/knowledge-refresher.js';
import { DocumentGraphRepository } from './document-graph.repository.js';

@Injectable()
export class RemovalService {
  private readonly logger = new Logger(RemovalService.name);

  constructor(
    private readonly graph: DocumentGraphRepository,
    private readonly refresher: KnowledgeRefresher,
    private readonly files: FileStore,
    private readonly documents: DocumentStatusRepository,
  ) {}

  async handleJob(documentId: string): Promise<void> {
    try {
      await this.remove(documentId);
    } catch (error) {
      this.logger.error(`Removing ${documentId} failed: ${errorMessage(error)}`);
      await this.documents.markRemovalFailed(documentId, errorMessage(error));
    }
  }

  /** The row goes last, so a failure at any step leaves the document visible and retryable. */
  async remove(documentId: string): Promise<void> {
    await this.graph.removeDocument(documentId);
    await this.refresher.refresh();
    await this.files.delete(documentId);
    await this.documents.delete(documentId);
    this.logger.log(`Removed document ${documentId}`);
  }
}
