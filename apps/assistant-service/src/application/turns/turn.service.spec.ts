import type { TurnEvent } from '@graph-rag/contracts';
import { ModelUnavailableError } from '@graph-rag/inference';
import { FakeChatModel } from '@graph-rag/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeConversationRepository } from '../../../test/fake-conversation.repository.js';
import { testConfig } from '../../../test/test-config.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { ConversationNotFoundError, QuestionNotFoundError } from '../conversations/errors.js';
import { HistoryLoader } from '../conversations/history-loader.js';
import { QueryAnalyzer } from '../query/analysis/query-analyzer.js';
import { AnswerStrategy, type AnswerEvent } from '../query/answering/answer-strategy.js';
import { TurnService } from './turn.service.js';

const graph = { nodes: [], edges: [] };
const citation = { chunkId: 'c1', documentId: 'd', documentName: 'd.txt', text: 'Text.' };

class ScriptedStrategy extends AnswerStrategy {
  readonly questions: string[] = [];

  constructor(
    private readonly route: string,
    private readonly events: AnswerEvent[] | Error,
  ) {
    super();
  }

  supports(route: string): boolean {
    return route === this.route;
  }

  async *answer({ question }: { question: string }): AsyncIterable<AnswerEvent> {
    this.questions.push(question);
    if (this.events instanceof Error) {
      throw this.events;
    }
    yield* this.events;
  }
}

async function collect(events: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const collected: TurnEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

describe('TurnService', () => {
  const id = 'conversation';
  let repository: FakeConversationRepository;
  let chat: FakeChatModel;
  let knowledge: ScriptedStrategy;
  let conversation: ScriptedStrategy;

  function createService(strategies: AnswerStrategy[] = [knowledge, conversation]): TurnService {
    const config = testConfig();
    return new TurnService(
      new ConversationsService(repository),
      new HistoryLoader(repository, chat, config),
      new QueryAnalyzer(chat, config),
      strategies,
    );
  }

  beforeEach(() => {
    repository = new FakeConversationRepository();
    repository.add(id);
    chat = new FakeChatModel(() => ({
      route: 'conversation',
      standaloneQuestion: 'Reformulated.',
    }));
    knowledge = new ScriptedStrategy('knowledge_base', [
      { type: 'graph', graph },
      { type: 'token', text: 'From ' },
      { type: 'token', text: 'documents.' },
      { type: 'citations', citations: [citation] },
    ]);
    conversation = new ScriptedStrategy('conversation', [{ type: 'token', text: 'From chat.' }]);
  });

  it('rejects an unknown conversation before anything is streamed', async () => {
    await expect(createService().start('missing', { content: 'Q' })).rejects.toThrow(
      ConversationNotFoundError,
    );
  });

  it('answers a first question from the knowledge base and saves both messages', async () => {
    const events = await collect(await createService().start(id, { content: 'Who is Alice?' }));

    expect(events.map((event) => event.type)).toEqual([
      'analysis',
      'graph',
      'token',
      'token',
      'citations',
      'done',
    ]);
    const { messages } = await new ConversationsService(repository).getDetails(id);
    expect(messages.map((message) => [message.role, message.content])).toEqual([
      ['user', 'Who is Alice?'],
      ['assistant', 'From documents.'],
    ]);
  });

  it('saves a snapshot of the graph and the citations with the answer', async () => {
    const events = await collect(await createService().start(id, { content: 'Who is Alice?' }));

    const done = events.at(-1);
    expect(done).toMatchObject({
      type: 'done',
      message: {
        role: 'assistant',
        metadata: {
          route: 'knowledge_base',
          standaloneQuestion: 'Who is Alice?',
          graph,
          citations: [citation],
        },
      },
    });
  });

  it('routes by the analysis and passes on the reformulated question', async () => {
    const service = createService();
    await collect(await service.start(id, { content: 'Who is Alice?' }));

    const events = await collect(await service.start(id, { content: 'And her manager?' }));

    expect(conversation.questions).toEqual(['Reformulated.']);
    expect(events[0]).toEqual({
      type: 'analysis',
      route: 'conversation',
      standaloneQuestion: 'Reformulated.',
    });
    expect(chat.lastPrompt).toContain('Who is Alice?');
  });

  it('reports a failure as an event and keeps the question', async () => {
    knowledge = new ScriptedStrategy('knowledge_base', new ModelUnavailableError('provider down'));

    const events = await collect(await createService().start(id, { content: 'Who is Alice?' }));

    expect(events.at(-1)).toEqual({ type: 'error', message: 'provider down' });
    const { messages } = await new ConversationsService(repository).getDetails(id);
    expect(messages.map((message) => message.role)).toEqual(['user']);
  });

  it('reports a route without a strategy', async () => {
    const events = await collect(await createService([conversation]).start(id, { content: 'Q' }));

    expect(events.at(-1)).toMatchObject({ type: 'error' });
  });

  it('asks a question again in place of itself and everything after it', async () => {
    const service = createService();
    await collect(await service.start(id, { content: 'Who is Alice?' }));
    await collect(await service.start(id, { content: 'And her manager?' }));
    const [first] = (await new ConversationsService(repository).getDetails(id)).messages;

    await collect(
      await service.start(id, { content: 'Who is Bob?', replacesFromMessageId: first?.id }),
    );

    const { title, messages } = await new ConversationsService(repository).getDetails(id);
    expect(messages.map((message) => [message.role, message.content])).toEqual([
      ['user', 'Who is Bob?'],
      ['assistant', 'From documents.'],
    ]);
    expect(title).toBe('Who is Bob?');
    expect(knowledge.questions.at(-1)).toBe('Who is Bob?');
  });

  it('keeps what came before the question it asks again', async () => {
    const service = createService();
    await collect(await service.start(id, { content: 'Who is Alice?' }));
    await collect(await service.start(id, { content: 'And her manager?' }));
    const second = (await new ConversationsService(repository).getDetails(id)).messages[2];

    await collect(
      await service.start(id, { content: 'And her team?', replacesFromMessageId: second?.id }),
    );

    const { title, messages } = await new ConversationsService(repository).getDetails(id);
    expect(messages.map((message) => message.content)).toEqual([
      'Who is Alice?',
      'From documents.',
      'And her team?',
      'From chat.',
    ]);
    expect(title).toBe('Who is Alice?');
  });

  it('refuses to replace what is not a question of this conversation, before streaming', async () => {
    const service = createService();
    await collect(await service.start(id, { content: 'Who is Alice?' }));
    const answer = (await new ConversationsService(repository).getDetails(id)).messages[1];

    await expect(
      service.start(id, { content: 'Q', replacesFromMessageId: answer?.id }),
    ).rejects.toThrow(QuestionNotFoundError);
    await expect(service.start(id, { content: 'Q', replacesFromMessageId: 99 })).rejects.toThrow(
      QuestionNotFoundError,
    );
  });

  it('stops without saving an answer when the caller goes away', async () => {
    const events = await createService().start(id, { content: 'Who is Alice?' });

    await events.next();
    await events.return(undefined);

    const { messages } = await new ConversationsService(repository).getDetails(id);
    expect(messages.map((message) => message.role)).toEqual(['user']);
  });
});
