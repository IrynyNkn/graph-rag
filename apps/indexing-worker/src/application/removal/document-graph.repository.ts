export abstract class DocumentGraphRepository {
  /**
   * Removes the document's chunks and their entries in relations, and marks the entities they
   * mentioned as stale. Safe to repeat, because removal jobs can be redelivered.
   */
  abstract removeDocument(documentId: string): Promise<void>;
}
