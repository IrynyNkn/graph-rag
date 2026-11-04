export class UnsupportedDocumentError extends Error {
  constructor(type: string) {
    super(`No parser supports documents of type "${type}"`);
    this.name = 'UnsupportedDocumentError';
  }
}

export class EmptyDocumentError extends Error {
  constructor(name: string) {
    super(`"${name}" contains no text`);
    this.name = 'EmptyDocumentError';
  }
}

export class NoChunkIndexedError extends Error {
  constructor(chunks: number) {
    super(`The model returned invalid output for all ${chunks} chunks`);
    this.name = 'NoChunkIndexedError';
  }
}
