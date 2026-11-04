export abstract class FileStore {
  abstract save(id: string, content: Buffer): Promise<void>;
  abstract read(id: string): Promise<Buffer>;
  /** Succeeds when the file is already gone, because removal jobs can be redelivered. */
  abstract delete(id: string): Promise<void>;
}
