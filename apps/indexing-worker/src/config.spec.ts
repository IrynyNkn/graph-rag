import { describe, expect, it } from 'vitest';
import { testConfig } from '../test/test-config.js';

describe('AppConfig', () => {
  it('applies defaults and groups settings', () => {
    const config = testConfig();

    expect(config.chunking).toEqual({ maxChars: 1500, overlapChars: 150, concurrency: 1 });
    expect(config.inference.chat).toMatchObject({ provider: 'ollama', contextWindow: 8192 });
    expect(config.inference.embedding.dimension).toBe(3);
  });

  it('rejects a chunk and an output that do not fit into the context window', () => {
    expect(() => testConfig({ CHAT_CONTEXT_WINDOW: '2048' })).toThrow('CHAT_CONTEXT_WINDOW');
  });

  it('rejects an overlap as large as the chunk', () => {
    expect(() => testConfig({ CHUNK_OVERLAP_CHARS: '1500' })).toThrow('CHUNK_OVERLAP_CHARS');
  });

  it('names a missing variable', () => {
    expect(() => testConfig({ NEO4J_URI: undefined })).toThrow('NEO4J_URI');
  });

  it('rejects an unknown provider', () => {
    expect(() => testConfig({ CHAT_PROVIDER: 'unknown' })).toThrow('CHAT_PROVIDER');
  });
});
