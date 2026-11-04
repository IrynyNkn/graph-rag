import type { RetrievalResult } from './retriever.js';

export interface QasaSeed {
  name: string;
  embedding: number[];
}

export interface QasaActivation {
  seeds: QasaSeed[];
  questionEmbedding: number[];
}

export abstract class QasaGraphRepository {
  /** Spreads activation from the seeds through the graph, gated by the question. */
  abstract activate(activation: QasaActivation): Promise<RetrievalResult>;
}
