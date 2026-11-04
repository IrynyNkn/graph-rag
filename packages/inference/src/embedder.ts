export abstract class Embedder {
  abstract embedDocuments(texts: string[]): Promise<number[][]>;
  abstract embedQuery(text: string): Promise<number[]>;
}
