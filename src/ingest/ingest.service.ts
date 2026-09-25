import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { parseJsonSafe } from '../common/parse-json.js';
import { GraphService } from '../graph/graph.service.js';
import { normaliseName, normaliseRelation } from '../graph/normalise.js';
import type { Triple } from '../graph/graph.types.js';
import { LlmService } from '../llm/llm.service.js';
import { buildExtractionPrompt } from './ingest.prompts.js';

/** Shape contract for the LLM's extraction output. Validation lives here, in the
 *  domain layer — GraphService receives only already-valid triples. */
const extractionSchema = z.object({
  triples: z.array(
    z.object({
      subject: z.string().min(1),
      relation: z.string().min(1),
      object: z.string().min(1),
    }),
  ),
});

export interface IngestResult {
  triplesExtracted: number;
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly graph: GraphService,
  ) {}

  async ingest(text: string): Promise<IngestResult> {
    const raw = await this.llm.generateText(buildExtractionPrompt(text), {
      json: true,
    });

    this.logger.debug(`Extraction output: ${raw}`);

    const parsed = extractionSchema.safeParse(parseJsonSafe(raw));
    if (!parsed.success) {
      this.logger.warn(`Extraction output rejected: ${parsed.error.message}`);
      throw new Error('Extraction failed: LLM output did not match schema');
    }

    const triples: Triple[] = parsed.data.triples.map((t) => ({
      subject: normaliseName(t.subject),
      relation: normaliseRelation(t.relation),
      object: normaliseName(t.object),
    }));

    await this.graph.upsertTriples(triples);
    return { triplesExtracted: triples.length };
  }
}
