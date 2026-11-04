/** Shaped like `FileStore`, and structural typing keeps this package off the file-store package. */
export class InMemoryFileStore {
  readonly files = new Map<string, Buffer>();
  saveFailure: Error | null = null;

  async save(id: string, content: Buffer): Promise<void> {
    if (this.saveFailure) {
      throw this.saveFailure;
    }
    this.files.set(id, content);
  }

  async read(id: string): Promise<Buffer> {
    const content = this.files.get(id);
    if (content === undefined) {
      throw new Error(`No file ${id}`);
    }
    return content;
  }

  async delete(id: string): Promise<void> {
    this.files.delete(id);
  }
}
