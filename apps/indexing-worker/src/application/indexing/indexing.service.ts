import { InvalidModelOutputError } from '@graph-rag/inference';
import { errorMessage } from '@graph-rag/nest-common';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config.js';
import { DocumentStatusRepository, type IndexableDocument } from '../document-status.repository.js';
import { KnowledgeRefresher } from '../knowledge/knowledge-refresher.js';
import { RemovalService } from '../removal/removal.service.js';
import { ChunkIndexer } from './chunk-indexer.js';
import { ChunkRepository } from './chunk.repository.js';
import { DocumentChunker, type DocumentChunk } from './chunking/document-chunker.js';
import { NoChunkIndexedError } from './errors.js';
import { DocumentReader } from './parsing/document-reader.js';
import { processConcurrently } from './process-concurrently.js';

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    private readonly documents: DocumentStatusRepository,
    private readonly reader: DocumentReader,
    private readonly chunker: DocumentChunker,
    private readonly chunks: ChunkRepository,
    private readonly chunkIndexer: ChunkIndexer,
    private readonly refresher: KnowledgeRefresher,
    private readonly removal: RemovalService,
    private readonly config: AppConfig,
  ) {}

  /** An error fails the document and ends the job: the user retries it from the UI. */
  async index(documentId: string): Promise<void> {
    const document = await this.documents.startIndexing(documentId);
    if (document === null) {
      return;
    }
    try {
      await this.run(document);
    } catch (error) {
      this.logger.error(`Indexing ${documentId} failed: ${errorMessage(error)}`);
      await this.documents.markIndexingFailed(documentId, errorMessage(error));
    }
  }

  private async run(document: IndexableDocument): Promise<void> {
    const chunks = this.chunker.chunk(await this.reader.read(document));
    const written = await this.chunks.findWrittenOrdinals(document.id);
    await this.documents.setProgress(document.id, chunks.length, written.size);

    const pending = chunks.filter((chunk) => !written.has(chunk.ordinal));
    let failed = 0;
    const finished = await processConcurrently(
      pending,
      this.config.chunking.concurrency,
      async (chunk) => {
        failed += (await this.indexChunk(document, chunk)) ? 0 : 1;
        return !(await this.documents.isBeingRemoved(document.id));
      },
    );
    if (!finished) {
      await this.removal.remove(document.id);
      return;
    }
    if (failed === chunks.length) {
      throw new NoChunkIndexedError(failed);
    }
    await this.refresher.refresh();
    await this.documents.markIndexed(document.id);
    this.logger.log(`Indexed ${document.name}: ${chunks.length} chunks, ${failed} failed`);
  }

  /** Bad output for one chunk must not block a document. Returns whether the chunk made it. */
  private async indexChunk(document: IndexableDocument, chunk: DocumentChunk): Promise<boolean> {
    try {
      await this.chunkIndexer.index(document, chunk);
      await this.documents.recordChunkDone(document.id);
      return true;
    } catch (error) {
      if (!(error instanceof InvalidModelOutputError)) {
        throw error;
      }
      this.logger.warn(`Skipping chunk ${chunk.ordinal} of ${document.id}: ${error.message}`);
      await this.documents.recordChunkFailed(document.id);
      return false;
    }
  }
}
