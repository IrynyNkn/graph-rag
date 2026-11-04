import { createHash } from 'node:crypto';
import { JobQueues, type Document, type DocumentJob } from '@graph-rag/contracts';
import { FileStore } from '@graph-rag/file-store';
import { JobPublisher } from '@graph-rag/job-queue';
import { Injectable, Logger } from '@nestjs/common';
import { detectDocumentFileType } from './document-file-type.js';
import { DocumentRepository } from './document.repository.js';
import {
  DocumentNotFoundError,
  DocumentNotRetryableError,
  DuplicateDocumentError,
  EmptyDocumentError,
} from './errors.js';

export interface DocumentUpload {
  name: string;
  content: Buffer;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly documents: DocumentRepository,
    private readonly files: FileStore,
    private readonly jobs: JobPublisher,
  ) {}

  list(): Promise<Document[]> {
    return this.documents.findAll();
  }

  async upload({ name, content }: DocumentUpload): Promise<Document> {
    const type = detectDocumentFileType(name);
    if (content.length === 0) {
      throw new EmptyDocumentError(name);
    }
    const document = await this.documents.insert({
      name,
      type,
      sizeBytes: content.length,
      contentHash: createHash('sha256').update(content).digest('hex'),
    });
    if (document === null) {
      throw new DuplicateDocumentError(name);
    }
    await this.saveFile(document.id, content);
    return this.publish(JobQueues.indexDocument, document);
  }

  async requestRemoval(id: string): Promise<Document> {
    const document = await this.documents.markDeleting(id);
    if (document === null) {
      throw new DocumentNotFoundError(id);
    }
    return this.publish(JobQueues.removeDocument, document);
  }

  async retry(id: string): Promise<Document> {
    const document = await this.documents.requeue(id);
    if (document !== null) {
      return this.publish(JobQueues.indexDocument, document);
    }
    const existing = await this.documents.findById(id);
    throw existing === null
      ? new DocumentNotFoundError(id)
      : new DocumentNotRetryableError(existing.status);
  }

  private async saveFile(id: string, content: Buffer): Promise<void> {
    try {
      await this.files.save(id, content);
    } catch (error) {
      await this.documents.delete(id);
      throw error;
    }
  }

  /** There is no outbox: a job that cannot be queued fails the document, and Retry recovers it. */
  private async publish(queue: string, document: Document): Promise<Document> {
    const job: DocumentJob = { documentId: document.id };
    try {
      await this.jobs.publish(queue, job);
      return document;
    } catch (error) {
      this.logger.error(`Could not queue a job for ${document.id}: ${String(error)}`);
      const failed = await this.documents.markFailed(document.id, 'Could not queue the job');
      return failed ?? document;
    }
  }
}
