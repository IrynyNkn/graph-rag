import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalFileStore } from './local-file-store.js';

describe('LocalFileStore', () => {
  let directory: string;
  let store: LocalFileStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'file-store-'));
    store = new LocalFileStore(join(directory, 'nested', 'files'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('saves and reads back a file, creating its directory', async () => {
    const content = Buffer.from([0, 1, 2, 255]);

    await store.save('id', content);

    await expect(store.read('id')).resolves.toEqual(content);
  });

  it('deletes a file', async () => {
    await store.save('id', Buffer.from('x'));

    await store.delete('id');

    await expect(store.read('id')).rejects.toThrow('ENOENT');
  });

  it('succeeds when deleting a file that is already gone', async () => {
    await expect(store.delete('missing')).resolves.toBeUndefined();
  });
});
