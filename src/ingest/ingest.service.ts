import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { parseJsonSafe } from '../common/parse-json.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { buildEntityDescription } from '../graph/describe.js';
import { GraphService } from '../graph/graph.service.js';
import { normaliseName, normaliseRelation } from '../graph/normalise.js';
import type { Triple } from '../graph/graph.types.js';
import { LlmService } from '../llm/llm.service.js';
import {
  buildEntityResolutionPrompt,
  buildExtractionPrompt,
} from './ingest.prompts.js';

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

const entityResolutionSchema = z.object({ sameEntity: z.boolean() });

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
    private readonly config: ConfigService,
  ) {}

  async ingest(text: string): Promise<IngestResult> {
    const knownTypes = await this.graph.getKnownRelationTypes();
    const raw = await this.llm.generateText(
      buildExtractionPrompt(text, knownTypes),
      { json: true },
    );

    this.logger.debug(`Extraction output: ${raw}`);

    const parsed = extractionSchema.safeParse(parseJsonSafe(raw));
    if (!parsed.success) {
      this.logger.warn(`Extraction output rejected: ${parsed.error.message}`);
      throw new Error('Extraction failed: LLM output did not match schema');
    }

    const normalisedTriples: Triple[] = parsed.data.triples.map((t) => ({
      subject: normaliseName(t.subject),
      relation: normaliseRelation(t.relation),
      object: normaliseName(t.object),
    }));

    // this.logger.debug(`Normalised triples: ${normalisedTriples}`);
    const triples = await this.resolveEntityNames(normalisedTriples);

    await this.graph.upsertTriples(triples);

    const touchedNames = new Set<string>();
    for (const t of triples) {
      touchedNames.add(t.subject);
      touchedNames.add(t.object);
    }
    await this.reembedEntities(touchedNames);

    // Stage 2: the GDS projection is a snapshot, not a live view — it must
    // be rebuilt whenever the graph it was taken from changes, same
    // reasoning as re-embedding above but for structure instead of content.
    if (triples.length > 0) {
      await this.graph.refreshProjection();
    }

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

  /**
   * Entity resolution (Stage 3): maps freshly-extracted names onto an
   * existing node's canonical name when they likely name the same
   * real-world entity, so a second document doesn't create a duplicate
   * under a different surface form ("Acme" vs "Acme Corp"). Resolved once
   * per *unique* name in this ingest call, not once per triple — a name
   * mentioned in three triples of the same document shouldn't trigger three
   * separate candidate searches and LLM calls for the same decision.
   */
  private async resolveEntityNames(triples: Triple[]): Promise<Triple[]> {
    const uniqueNames = new Set<string>();
    for (const t of triples) {
      uniqueNames.add(t.subject);
      uniqueNames.add(t.object);
    }

    const resolved = new Map<string, string>();
    for (const name of uniqueNames) {
      resolved.set(name, await this.resolveEntityName(name));
    }

    return triples.map((t) => ({
      ...t,
      subject: resolved.get(t.subject) ?? t.subject,
      object: resolved.get(t.object) ?? t.object,
    }));
  }

  /**
   * Cheap exact-match short-circuit first — MERGE already handles that case
   * correctly on its own, so the candidate search + LLM confirmation below
   * only runs for genuinely new-looking names. Candidates come from two
   * independent sources (semantic + lexical, see graph.service.ts);
   * confirmation stops at the first match rather than checking every
   * candidate once one is confirmed.
   */
  private async resolveEntityName(name: string): Promise<string> {
    if (await this.graph.entityExists(name)) return name;

    const threshold = this.config.getOrThrow<number>(
      'entityResolution.candidateSimilarityThreshold',
    );
    const vector = await this.embedding.embedQuery(name);
    const [vectorCandidates, fulltextCandidates] = await Promise.all([
      this.graph.findSeedNodesByVector(vector, threshold, 5),
      this.graph.findCandidatesByFulltext(name, 5),
    ]);

    // this.logger.debug('vectorCandidates', vectorCandidates);
    // this.logger.debug('fulltextCandidates', fulltextCandidates);

    const candidateNames = new Set<string>();
    for (const c of vectorCandidates) candidateNames.add(c.name);
    for (const c of fulltextCandidates) candidateNames.add(c.name);

    // this.logger.debug('candidateNames', candidateNames);

    for (const candidate of candidateNames) {
      if (await this.confirmSameEntity(name, candidate)) {
        this.logger.log(`Entity resolution: "${name}" -> "${candidate}"`);
        return candidate;
      }
    }

    return name;
  }

  /** Fails closed on a broken LLM response: treats it as "not the same
   *  entity" rather than risk merging two different things on garbage
   *  output. Merging wrongly is the worse failure mode here, not the safer
   *  one (unlike extraction, where an empty result was the safe default). */
  private async confirmSameEntity(
    newName: string,
    candidateName: string,
  ): Promise<boolean> {
    const candidateContext = await this.graph.getEmbeddingText(candidateName);
    const raw = await this.llm.generateText(
      buildEntityResolutionPrompt(newName, candidateName, candidateContext),
      { json: true },
    );

    const parsed = entityResolutionSchema.safeParse(parseJsonSafe(raw));
    if (!parsed.success) {
      this.logger.warn(
        `Entity resolution confirmation rejected: ${parsed.error.message}`,
      );
      return false;
    }
    // this.logger.debug(
    //   `
    //     Candidate name: ${candidateName};
    //     New Name: ${newName};
    //     Candidate context: ${candidateContext};
    //     Is same entity: ${parsed.data.sameEntity}
    //   `,
    // );
    return parsed.data.sameEntity;
  }
}
