import { ChatModel, InvalidModelOutputError } from '@graph-rag/inference';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '../../../config.js';
import { normalizeExtraction } from '../extraction/extraction-normalizer.js';
import type { ExtractedEntity, Extraction } from '../extraction/extraction.js';
import { isPlausibleAlias } from './alias-filter.js';
import { EntityCandidateRepository, type EntityCandidate } from './entity-candidate.repository.js';
import { buildResolutionMessages } from './resolution.prompt.js';

// A small model asked for the boolean alone answers almost at random. Writing one sentence first
// took qwen3.5:4b from 4 to 8 correct out of 9 test pairs, so the order of these fields matters.
const verdictSchema = z.object({ reasoning: z.string(), sameEntity: z.boolean() });

@Injectable()
export class EntityResolver {
  private readonly logger = new Logger(EntityResolver.name);

  constructor(
    private readonly candidates: EntityCandidateRepository,
    private readonly chat: ChatModel,
    private readonly config: AppConfig,
  ) {}

  /** Maps new names onto entities already in the graph. Exact names merge on their own. */
  async resolve(extraction: Extraction): Promise<Extraction> {
    const names = extraction.entities.map((entity) => entity.name);
    const existing = await this.candidates.findExistingNames(names);
    const renames = new Map<string, string>();
    for (const entity of extraction.entities) {
      const match = existing.has(entity.name) ? null : await this.findMatch(entity);
      if (match !== null) {
        renames.set(entity.name, match);
      }
    }
    return renames.size > 0 ? applyRenames(extraction, renames) : extraction;
  }

  private async findMatch(entity: ExtractedEntity): Promise<string | null> {
    const { maxCandidates } = this.config.resolution;
    const candidates = await this.candidates.findCandidates(entity.name, maxCandidates);
    for (const candidate of candidates) {
      if (isPlausibleAlias(entity, candidate) && (await this.confirm(entity, candidate))) {
        return candidate.name;
      }
    }
    return null;
  }

  /** Fails closed: a wrong merge is worse than a duplicate. */
  private async confirm(entity: ExtractedEntity, candidate: EntityCandidate): Promise<boolean> {
    try {
      const { sameEntity } = await this.chat.completeStructured(
        {
          messages: buildResolutionMessages(entity, candidate),
          temperature: 0,
          maxOutputTokens: this.config.resolution.maxOutputTokens,
        },
        verdictSchema,
      );
      return sameEntity;
    } catch (error) {
      if (error instanceof InvalidModelOutputError) {
        this.logger.warn(`Keeping "${entity.name}" apart: ${error.message}`);
        return false;
      }
      throw error;
    }
  }
}

function applyRenames(extraction: Extraction, renames: Map<string, string>): Extraction {
  const rename = (name: string) => renames.get(name) ?? name;
  return normalizeExtraction({
    entities: extraction.entities.map((entity) => ({ ...entity, name: rename(entity.name) })),
    triples: extraction.triples.map((triple) => ({
      ...triple,
      subject: rename(triple.subject),
      object: rename(triple.object),
    })),
  });
}
