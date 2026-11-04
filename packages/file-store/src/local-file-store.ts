import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FileStore } from './file-store.js';

/** Files are named by document ID, so an uploaded file name never reaches a path. */
export class LocalFileStore extends FileStore {
  constructor(private readonly directory: string) {
    super();
  }

  async save(id: string, content: Buffer): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathOf(id), content);
  }

  read(id: string): Promise<Buffer> {
    return readFile(this.pathOf(id));
  }

  async delete(id: string): Promise<void> {
    await rm(this.pathOf(id), { force: true });
  }

  private pathOf(id: string): string {
    return join(this.directory, id);
  }
}
