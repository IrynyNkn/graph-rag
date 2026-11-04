import { InvalidModelOutputError, ModelUnavailableError } from '@graph-rag/inference';
import { FakeChatModel } from '@graph-rag/testing';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../../test/test-config.js';
import { QueryAnalyzer } from './query-analyzer.js';

const history = {
  summary: null,
  messages: [{ role: 'assistant' as const, content: 'Alice manages the team.' }],
};

describe('QueryAnalyzer', () => {
  it('skips the model when there is no history', async () => {
    const chat = new FakeChatModel();

    const analysis = await new QueryAnalyzer(chat, testConfig()).analyze('Who is Alice?', {
      summary: null,
      messages: [],
    });

    expect(analysis).toEqual({ route: 'knowledge_base', standaloneQuestion: 'Who is Alice?' });
    expect(chat.requests).toEqual([]);
  });

  it('returns the route and the reformulated question of the model', async () => {
    const chat = new FakeChatModel(() => ({
      route: 'conversation',
      standaloneQuestion: 'What does Alice manage?',
    }));

    const analysis = await new QueryAnalyzer(chat, testConfig()).analyze(
      'What does she manage?',
      history,
    );

    expect(analysis).toEqual({
      route: 'conversation',
      standaloneQuestion: 'What does Alice manage?',
    });
    expect(chat.lastPrompt).toContain('Alice manages the team.');
    expect(chat.lastPrompt).toContain('What does she manage?');
  });

  it('falls back to the knowledge base on invalid output', async () => {
    const chat = new FakeChatModel(() => new InvalidModelOutputError('not JSON'));

    const analysis = await new QueryAnalyzer(chat, testConfig()).analyze('Question?', history);

    expect(analysis).toEqual({ route: 'knowledge_base', standaloneQuestion: 'Question?' });
  });

  it('propagates an unavailable provider', async () => {
    const chat = new FakeChatModel(() => new ModelUnavailableError('down'));

    await expect(
      new QueryAnalyzer(chat, testConfig()).analyze('Question?', history),
    ).rejects.toThrow(ModelUnavailableError);
  });
});
