import { ChatModel } from '@graph-rag/inference';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config.js';
import type { DocumentChunk } from '../chunking/document-chunker.js';
import { normalizeExtraction } from './extraction-normalizer.js';
import { buildExtractionMessages } from './extraction.prompt.js';
import { extractionSchema, type Extraction } from './extraction.js';

@Injectable()
export class TripleExtractor {
  constructor(
    private readonly chat: ChatModel,
    private readonly config: AppConfig,
  ) {}

  async extract(chunk: DocumentChunk, documentName: string): Promise<Extraction> {
    const extraction = await this.chat.completeStructured(
      {
        messages: buildExtractionMessages(chunk, documentName),
        temperature: 0,
        maxOutputTokens: this.config.extraction.maxOutputTokens,
      },
      extractionSchema,
    );
    return normalizeExtraction(extraction);
  }
}
