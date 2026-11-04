import { FakeChatModel } from '@graph-rag/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeConversationRepository } from '../../../test/fake-conversation.repository.js';
import { testConfig } from '../../../test/test-config.js';
import { formatHistory, isEmptyHistory } from './conversation-history.js';
import { ConversationsService } from './conversations.service.js';
import { ConversationNotFoundError } from './errors.js';
import { HistoryLoader } from './history-loader.js';

describe('ConversationsService', () => {
  let repository: FakeConversationRepository;
  let service: ConversationsService;

  beforeEach(() => {
    repository = new FakeConversationRepository();
    service = new ConversationsService(repository);
  });

  it('creates and lists conversations', async () => {
    const created = await service.create();

    await expect(service.list()).resolves.toMatchObject([{ id: created.id, title: null }]);
  });

  it('names a conversation after its first question only', async () => {
    const { id } = await service.create();

    await service.appendUserMessage(id, 'First question');
    await service.appendUserMessage(id, 'Second question');

    expect((await service.getDetails(id)).title).toBe('First question');
  });

  it('shortens a long title', async () => {
    const { id } = await service.create();

    await service.appendUserMessage(id, 'x'.repeat(100));

    expect((await service.getDetails(id)).title).toBe(`${'x'.repeat(60)}...`);
  });

  it('stores the metadata of an assistant message', async () => {
    const { id } = await service.create();
    const metadata = {
      route: 'conversation' as const,
      standaloneQuestion: 'Q',
      graph: null,
      citations: [],
    };

    const message = await service.appendAssistantMessage(id, 'Answer', metadata);

    expect(message).toMatchObject({ role: 'assistant', content: 'Answer', metadata });
  });

  it('reports an unknown conversation', async () => {
    await expect(service.getDetails('missing')).rejects.toThrow(ConversationNotFoundError);
    await expect(service.delete('missing')).rejects.toThrow(ConversationNotFoundError);
    await expect(service.ensureExists('missing')).rejects.toThrow(ConversationNotFoundError);
  });

  it('deletes a conversation', async () => {
    const { id } = await service.create();

    await service.delete(id);

    await expect(service.ensureExists(id)).rejects.toThrow(ConversationNotFoundError);
  });
});

describe('conversation history helpers', () => {
  it('knows when there is nothing yet', () => {
    expect(isEmptyHistory({ summary: null, messages: [] })).toBe(true);
    expect(isEmptyHistory({ summary: 'Earlier.', messages: [] })).toBe(false);
    expect(isEmptyHistory({ summary: null, messages: [{ role: 'user', content: 'Hi' }] })).toBe(
      false,
    );
  });

  it('formats the summary before the messages', () => {
    const text = formatHistory({
      summary: 'They met.',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(text).toBe('Summary of the earlier conversation: They met.\nuser: Hi');
  });
});

describe('HistoryLoader', () => {
  const id = 'conversation';
  let repository: FakeConversationRepository;
  let chat: FakeChatModel;
  let loader: HistoryLoader;

  beforeEach(() => {
    repository = new FakeConversationRepository();
    repository.add(id);
    chat = new FakeChatModel(() => 'The folded summary.');
    loader = new HistoryLoader(
      repository,
      chat,
      // Tokens are characters divided by four, so these budgets are 40 and 20 characters.
      testConfig({ HISTORY_MAX_TOKENS: '10', HISTORY_RECENT_TOKENS: '5' }),
    );
  });

  async function say(...contents: string[]): Promise<number> {
    let lastId = 0;
    for (const content of contents) {
      lastId = (await repository.appendMessage(id, { role: 'user', content })).id;
    }
    return lastId;
  }

  it('returns messages under budget, without the current one and without the model', async () => {
    const earlier = await say('Short.');
    const current = await say('Current question.');

    const history = await loader.load(id, current);

    expect(earlier).toBeLessThan(current);
    expect(history).toEqual({ summary: null, messages: [{ role: 'user', content: 'Short.' }] });
    expect(chat.requests).toEqual([]);
  });

  it('folds the older messages into the summary when over budget', async () => {
    const lastOlder = await say('a'.repeat(30), 'b'.repeat(30));
    const recent = await say('Recent.');
    const current = await say('Current.');

    const history = await loader.load(id, current);

    expect(history).toEqual({
      summary: 'The folded summary.',
      messages: [{ role: 'user', content: 'Recent.' }],
    });
    expect(recent).toBeGreaterThan(lastOlder);
    await expect(repository.findSummaryState(id)).resolves.toMatchObject({
      summary: 'The folded summary.',
      summarisedUpToMessageId: lastOlder,
    });
  });

  it('gives the model the previous summary and the messages to fold', async () => {
    repository.add(id, { summary: 'Earlier summary.', summarisedUpToMessageId: 0 });
    await say('a'.repeat(50));
    const current = await say('Current.');

    await loader.load(id, current);

    expect(chat.lastPrompt).toContain('Earlier summary.');
    expect(chat.lastPrompt).toContain('a'.repeat(50));
  });

  it('skips what is already summarised', async () => {
    const summarised = await say('Old.');
    repository.add(id, { summary: 'Old summary.', summarisedUpToMessageId: summarised });
    const kept = await say('Kept.');
    const current = await say('Current.');

    const history = await loader.load(id, current);

    expect(kept).toBeGreaterThan(summarised);
    expect(history).toEqual({
      summary: 'Old summary.',
      messages: [{ role: 'user', content: 'Kept.' }],
    });
  });

  it('folds a single message that alone is over budget', async () => {
    const last = await say('x'.repeat(100));
    const current = await say('Current.');

    const history = await loader.load(id, current);

    expect(history.messages).toEqual([]);
    expect(last).toBeLessThan(current);
    expect(history.summary).toBe('The folded summary.');
  });
});
