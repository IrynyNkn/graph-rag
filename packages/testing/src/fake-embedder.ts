import { Embedder } from '@graph-rag/inference';

/** Returns a registered vector, or a stable one derived from the text. */
export class FakeEmbedder extends Embedder {
  readonly documentBatches: string[][] = [];

  constructor(
    private readonly dimension: number,
    private readonly vectors: ReadonlyMap<string, number[]> = new Map(),
  ) {
    super();
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    this.documentBatches.push(texts);
    return texts.map((text) => this.vectorOf(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.vectorOf(text);
  }

  private vectorOf(text: string): number[] {
    return this.vectors.get(text) ?? this.derive(text);
  }

  private derive(text: string): number[] {
    const seed = [...text].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 1);
    return Array.from({ length: this.dimension }, (_, index) => Math.sin(seed + index) + 1.5);
  }
}
