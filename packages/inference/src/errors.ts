export class InferenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The provider cannot be reached or is overloaded. Worth retrying. */
export class ModelUnavailableError extends InferenceError {}

/** The provider rejected the request: bad key, unknown model. Retrying cannot help. */
export class ModelRequestError extends InferenceError {}

/** The model answered with something that does not match the requested schema. */
export class InvalidModelOutputError extends InferenceError {}

/** The embedder returned vectors that the graph's vector index would silently skip. */
export class EmbeddingDimensionError extends InferenceError {}
