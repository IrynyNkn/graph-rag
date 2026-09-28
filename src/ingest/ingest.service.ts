import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { parseJsonSafe } from '../common/parse-json.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { buildEntityDescription } from '../graph/describe.js';
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
    private readonly embedding: EmbeddingService,
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

    const touchedNames = new Set<string>();
    for (const t of triples) {
      touchedNames.add(t.subject);
      touchedNames.add(t.object);
    }
    await this.reembedEntities(touchedNames);

    return { triplesExtracted: triples.length };
  }

  /**
   * Re-derives each touched node's description from its *current* edges
   * (old ones included) and re-embeds it — not just the edges this call
   * added. A node's embedding must reflect everything known about it, or a
   * second document that only adds one more fact would leave the node
   * findable only by its first document's content.
   *
   * Sequential on purpose: this is one local model on one machine, so
   * parallel calls would just queue up behind each other anyway, and
   * sequential keeps failures easy to attribute to one node.
   */
  private async reembedEntities(names: Set<string>): Promise<void> {
    for (const name of names) {
      const { edges } = await this.graph.getNeighborhood([name]);
      const description = buildEntityDescription(name, edges);
      const vector = await this.embedding.embedDocument(description);
      await this.graph.upsertEmbedding(
        name,
        vector,
        description,
        this.embedding.modelName,
      );
    }
  }
}
