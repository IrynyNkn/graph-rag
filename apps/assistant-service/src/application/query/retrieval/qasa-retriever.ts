import { Embedder } from '@graph-rag/inference';
import { Injectable } from '@nestjs/common';
import { deduplicatePaths } from './path-deduplication.js';
import { QasaGraphRepository } from './qasa-graph.repository.js';
import { QueryEntityExtractor } from './query-entity-extractor.js';
import { Retriever, type RetrievalResult } from './retriever.js';

/** QASA: Query-Aware Spreading Activation, ported from github.com/kinfi4/qasa-graph-rag. */
@Injectable()
export class QasaRetriever extends Retriever {
  constructor(
    private readonly queryEntities: QueryEntityExtractor,
    private readonly embedder: Embedder,
    private readonly graph: QasaGraphRepository,
  ) {
    super();
  }

  async retrieve(question: string): Promise<RetrievalResult> {
    const entities = await this.queryEntities.extract(question);
    const questionEmbedding = await this.embedder.embedQuery(question);
    const seeds = await Promise.all(
      entities.map(async ({ name, searchHint }) => ({
        name,
        embedding: await this.embedder.embedQuery(searchHint),
      })),
    );
    const result = await this.graph.activate({ seeds, questionEmbedding });
    return { ...result, paths: deduplicatePaths(result.paths) };
  }
}
