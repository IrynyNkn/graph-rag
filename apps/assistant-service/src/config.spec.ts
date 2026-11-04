import { describe, expect, it } from 'vitest';
import { testConfig } from '../test/test-config.js';

describe('AppConfig', () => {
  it('applies the QASA defaults', () => {
    expect(testConfig().qasa).toMatchObject({
      maxSteps: 3,
      decay: 0.7,
      threshold: 0.01,
      topPaths: 30,
      topEntities: 30,
      seedsPerEntity: 5,
    });
  });

  it('rejects budgets that do not fit into the context window', () => {
    expect(() => testConfig({ CHAT_CONTEXT_WINDOW: '4096' })).toThrow('CHAT_CONTEXT_WINDOW');
  });

  it('rejects keeping more recent history than the budget allows', () => {
    expect(() => testConfig({ HISTORY_RECENT_TOKENS: '1000' })).toThrow('HISTORY_RECENT_TOKENS');
  });

  it('names a missing variable', () => {
    expect(() => testConfig({ POSTGRES_URL: undefined })).toThrow('POSTGRES_URL');
  });
});
