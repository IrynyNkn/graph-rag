import type { Citation } from '@graph-rag/contracts';
import { estimateTokens } from '@graph-rag/inference';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config.js';
import type { RetrievalResult, RetrievedPath } from '../retrieval/retriever.js';
import { SourceChunkRepository } from './source-chunk.repository.js';

export interface AnswerContext {
  paths: string[];
  descriptions: string[];
  chunks: Citation[];
}

/**
 * Fits retrieval results into the prompt budget. Everything arrives strongest first, so what
 * falls off the end has the lowest weight, and a section's unused budget passes to the next one.
 */
@Injectable()
export class ContextBuilder {
  constructor(
    private readonly sourceChunks: SourceChunkRepository,
    private readonly config: AppConfig,
  ) {}

  async build(retrieval: RetrievalResult): Promise<AnswerContext> {
    const { pathsTokens, descriptionsTokens, chunksTokens } = this.config.context;
    const paths = takeWithinBudget(retrieval.paths.map(formatPath), pathsTokens, (line) => line);
    const descriptionBudget = descriptionsTokens + leftover(paths.taken, pathsTokens);
    const descriptions = takeWithinBudget(
      formatDescriptions(retrieval),
      descriptionBudget,
      (line) => line,
    );
    const chunkBudget = chunksTokens + leftover(descriptions.taken, descriptionBudget);
    const chunks = takeWithinBudget(
      await this.findChunks(retrieval),
      chunkBudget,
      (chunk) => chunk.text,
    );
    return { paths: paths.items, descriptions: descriptions.items, chunks: chunks.items };
  }

  /** Chunks behind the strongest relations come first, then those of the strongest entities. */
  private async findChunks(retrieval: RetrievalResult): Promise<Citation[]> {
    const { maxChunks } = this.config.context;
    const ids = rankChunkIds(retrieval.paths).slice(0, maxChunks);
    const fromPaths = ids.length > 0 ? await this.sourceChunks.findByIds(ids) : [];
    if (fromPaths.length >= maxChunks) {
      return fromPaths;
    }
    const names = retrieval.entities.map((entity) => entity.name);
    const fromEntities =
      names.length > 0 ? await this.sourceChunks.findMentioning(names, maxChunks) : [];
    const seen = new Set(fromPaths.map((chunk) => chunk.chunkId));
    const extra = fromEntities.filter((chunk) => !seen.has(chunk.chunkId));
    return [...fromPaths, ...extra].slice(0, maxChunks);
  }
}

function formatPath({ nodes, edges }: RetrievedPath): string {
  let line = nodes[0]?.name ?? '';
  edges.forEach((edge, index) => {
    const relations = [...new Set(edge.relations)].join(', ');
    const next = nodes[index + 1]?.name ?? '';
    line += edge.forward ? ` --[${relations}]--> ${next}` : ` <--[${relations}]-- ${next}`;
  });
  return line;
}

function formatDescriptions({ entities }: RetrievalResult): string[] {
  return entities.flatMap(({ name, description }) =>
    description ? [`- ${name}: ${description}`] : [],
  );
}

function rankChunkIds(paths: RetrievedPath[]): string[] {
  return [...new Set(paths.flatMap((path) => path.edges.flatMap((edge) => edge.chunkIds)))];
}

interface Taken<T> {
  items: T[];
  taken: number;
}

function takeWithinBudget<T>(items: T[], budget: number, textOf: (item: T) => string): Taken<T> {
  const result: T[] = [];
  let taken = 0;
  for (const item of items) {
    const tokens = estimateTokens(textOf(item));
    if (taken + tokens > budget) {
      break;
    }
    result.push(item);
    taken += tokens;
  }
  return { items: result, taken };
}

function leftover(taken: number, budget: number): number {
  return budget - taken;
}
