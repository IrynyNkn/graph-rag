import type { Citation } from '@graph-rag/contracts';
import { FakeChatModel } from '@graph-rag/testing';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../../test/test-config.js';
import { Retriever, type RetrievalResult, type RetrievedPath } from '../retrieval/retriever.js';
import type { AnswerEvent } from './answer-strategy.js';
import { ContextBuilder } from './context-builder.js';
import { ConversationAnswerStrategy } from './conversation-answer.strategy.js';
import { KnowledgeBaseAnswerStrategy } from './knowledge-base-answer.strategy.js';
import { toRetrievedGraph } from './retrieved-graph.js';
import { SourceChunkRepository } from './source-chunk.repository.js';

const entity = (name: string, activation = 1, description: string | null = `About ${name}.`) => ({
  name,
  type: 'CONCEPT',
  description,
  activation,
});

const edge = (relations: string[], chunkIds: string[], forward = true) => ({
  relations,
  chunkIds,
  forward,
});

const pathOf = (names: string[], edges: RetrievedPath['edges'], weight = 1): RetrievedPath => ({
  nodes: names.map((name) => entity(name)),
  edges,
  weight,
});

const citation = (chunkId: string, text = `Text of ${chunkId}.`): Citation => ({
  chunkId,
  documentId: 'doc',
  documentName: 'doc.txt',
  text,
});

class FakeSourceChunks extends SourceChunkRepository {
  readonly requestedIds: string[][] = [];

  constructor(private readonly chunks: Citation[]) {
    super();
  }

  async findByIds(ids: string[]): Promise<Citation[]> {
    this.requestedIds.push(ids);
    return ids.flatMap((id) => this.chunks.filter((chunk) => chunk.chunkId === id));
  }

  async findMentioning(_names: string[], limit: number): Promise<Citation[]> {
    return this.chunks.slice(0, limit);
  }
}

const emptyRetrieval: RetrievalResult = { seedNames: [], paths: [], entities: [] };

describe('toRetrievedGraph', () => {
  it('collects path nodes with activation and seed flag', () => {
    const graph = toRetrievedGraph({
      seedNames: ['a'],
      paths: [pathOf(['a', 'b'], [edge(['r'], ['c1'])])],
      entities: [],
    });

    expect(graph.nodes).toEqual([
      { ...entity('a'), isSeed: true },
      { ...entity('b'), isSeed: false },
    ]);
  });

  it('keeps a seed without a path, and drops other entities that would float unconnected', () => {
    const graph = toRetrievedGraph({
      seedNames: ['a'],
      paths: [],
      entities: [entity('a', 1), entity('b', 0.5)],
    });

    expect(graph.nodes).toEqual([{ ...entity('a', 1), isSeed: true }]);
  });

  it('directs edges by the relation and not by the walk', () => {
    const graph = toRetrievedGraph({
      seedNames: [],
      entities: [],
      paths: [pathOf(['a', 'b'], [edge(['r'], ['c1'], false)])],
    });

    expect(graph.edges[0]).toMatchObject({ source: 'b', target: 'a' });
  });

  it('merges an edge shared by paths and keeps the highest weight', () => {
    const graph = toRetrievedGraph({
      seedNames: [],
      entities: [],
      paths: [
        pathOf(['a', 'b'], [edge(['r', 'r'], ['c1', 'c1'])], 0.5),
        pathOf(['a', 'b', 'c'], [edge(['r'], ['c1']), edge(['s'], ['c2'])], 0.9),
      ],
    });

    expect(graph.edges).toEqual([
      { source: 'a', target: 'b', relations: ['r'], chunkIds: ['c1'], weight: 0.9 },
      { source: 'b', target: 'c', relations: ['s'], chunkIds: ['c2'], weight: 0.9 },
    ]);
  });
});

describe('ContextBuilder', () => {
  function build(retrieval: RetrievalResult, chunks: Citation[] = [], env = {}) {
    const sourceChunks = new FakeSourceChunks(chunks);
    const builder = new ContextBuilder(sourceChunks, testConfig(env));
    return { sourceChunks, context: builder.build(retrieval) };
  }

  it('formats paths in both directions and unique relations', async () => {
    const { context } = build({
      seedNames: [],
      entities: [],
      paths: [
        pathOf(['a', 'b', 'c'], [edge(['knows', 'knows', 'likes'], []), edge(['owns'], [], false)]),
      ],
    });

    expect((await context).paths).toEqual(['a --[knows, likes]--> b <--[owns]-- c']);
  });

  it('skips entities without a description', async () => {
    const { context } = build({
      seedNames: [],
      paths: [],
      entities: [entity('a', 1, 'Known.'), entity('b', 1, null)],
    });

    expect((await context).descriptions).toEqual(['- a: Known.']);
  });

  it('drops the weakest items beyond the budget', async () => {
    const { context } = build(
      {
        seedNames: [],
        paths: [],
        entities: [entity('first', 1, 'x'.repeat(40)), entity('second', 1, 'y'.repeat(40))],
      },
      [],
      {
        CONTEXT_PATHS_TOKENS: '1',
        CONTEXT_DESCRIPTIONS_TOKENS: '13',
        CONTEXT_CHUNKS_TOKENS: '1',
      },
    );

    expect((await context).descriptions).toHaveLength(1);
  });

  it('lets an unused budget pass to the next section', async () => {
    const { context } = build(
      { seedNames: [], paths: [], entities: [entity('a', 1, null)] },
      [citation('c1', 'x'.repeat(400))],
      {
        CONTEXT_PATHS_TOKENS: '50',
        CONTEXT_DESCRIPTIONS_TOKENS: '50',
        CONTEXT_CHUNKS_TOKENS: '1',
      },
    );

    expect((await context).chunks).toHaveLength(1);
  });

  it('prefers chunks behind the strongest paths, unique and capped', async () => {
    const chunks = ['c1', 'c2', 'c3'].map((id) => citation(id));
    const { context, sourceChunks } = build(
      {
        seedNames: [],
        entities: [],
        paths: [
          pathOf(['a', 'b'], [edge(['r'], ['c2', 'c2'])]),
          pathOf(['b', 'c'], [edge(['r'], ['c1', 'c3'])]),
        ],
      },
      chunks,
      { CONTEXT_MAX_CHUNKS: '2' },
    );

    expect((await context).chunks.map((chunk) => chunk.chunkId)).toEqual(['c2', 'c1']);
    expect(sourceChunks.requestedIds).toEqual([['c2', 'c1']]);
  });

  it('fills up with chunks mentioning the strongest entities, without repeats', async () => {
    const chunks = [citation('c1'), citation('c2')];
    const { context } = build(
      {
        seedNames: [],
        entities: [entity('a')],
        paths: [pathOf(['a', 'b'], [edge(['r'], ['c2'])])],
      },
      chunks,
    );

    expect((await context).chunks.map((chunk) => chunk.chunkId)).toEqual(['c2', 'c1']);
  });

  it('asks for nothing when retrieval found nothing', async () => {
    const { context, sourceChunks } = build(emptyRetrieval, [citation('c1')]);

    await expect(context).resolves.toEqual({ paths: [], descriptions: [], chunks: [] });
    expect(sourceChunks.requestedIds).toEqual([]);
  });
});

async function collect(events: AsyncIterable<AnswerEvent>): Promise<AnswerEvent[]> {
  const collected: AnswerEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

describe('KnowledgeBaseAnswerStrategy', () => {
  class StubRetriever extends Retriever {
    constructor(private readonly result: RetrievalResult) {
      super();
    }

    async retrieve(): Promise<RetrievalResult> {
      return this.result;
    }
  }

  function createStrategy(
    retrieval: RetrievalResult,
    chat: FakeChatModel,
    chunks: Citation[] = [],
  ) {
    const config = testConfig();
    return new KnowledgeBaseAnswerStrategy(
      new StubRetriever(retrieval),
      new ContextBuilder(new FakeSourceChunks(chunks), config),
      chat,
      config,
    );
  }

  const retrieval: RetrievalResult = {
    seedNames: ['alice'],
    entities: [entity('alice')],
    paths: [pathOf(['alice', 'team'], [edge(['manages'], ['c1'])])],
  };
  const history = {
    summary: 'They discussed staffing.',
    messages: [{ role: 'user' as const, content: 'Earlier question' }],
  };

  it('only handles the knowledge base route', () => {
    const strategy = createStrategy(retrieval, new FakeChatModel());

    expect(strategy.supports('knowledge_base')).toBe(true);
    expect(strategy.supports('conversation')).toBe(false);
  });

  it('emits the graph first, then tokens, then citations', async () => {
    const strategy = createStrategy(retrieval, new FakeChatModel(() => 'Alice does.'), [
      citation('c1'),
    ]);

    const events = await collect(strategy.answer({ question: 'Who?', history }));

    expect(events.map((event) => event.type)).toEqual(['graph', 'token', 'token', 'citations']);
    expect(events.at(-1)).toEqual({ type: 'citations', citations: [citation('c1')] });
  });

  it('puts the context, the summary and the history into the prompt', async () => {
    const chat = new FakeChatModel(() => 'Alice does.');
    const strategy = createStrategy(retrieval, chat, [citation('c1')]);

    await collect(strategy.answer({ question: 'Who manages the team?', history }));

    expect(chat.lastPrompt).toContain('alice --[manages]--> team');
    expect(chat.lastPrompt).toContain('- alice: About alice.');
    expect(chat.lastPrompt).toContain('From "doc.txt":\nText of c1.');
    expect(chat.lastPrompt).toContain('They discussed staffing.');
    expect(chat.lastPrompt).toContain('Earlier question');
    expect(chat.requests[0]?.messages.at(-1)).toEqual({
      role: 'user',
      content: 'Who manages the team?',
    });
  });

  it('tells the model when nothing was found, and cites nothing', async () => {
    const chat = new FakeChatModel(() => 'Hello!');
    const strategy = createStrategy(emptyRetrieval, chat);

    const events = await collect(
      strategy.answer({ question: 'Hi', history: { summary: null, messages: [] } }),
    );

    expect(chat.lastPrompt).toContain('nothing relevant');
    expect(events[0]).toEqual({ type: 'graph', graph: { nodes: [], edges: [] } });
    expect(events.at(-1)).toEqual({ type: 'citations', citations: [] });
  });
});

describe('ConversationAnswerStrategy', () => {
  it('only handles the conversation route', () => {
    const strategy = new ConversationAnswerStrategy(new FakeChatModel(), testConfig());

    expect(strategy.supports('conversation')).toBe(true);
    expect(strategy.supports('knowledge_base')).toBe(false);
  });

  it('answers from the history alone', async () => {
    const chat = new FakeChatModel(() => 'You are welcome.');
    const strategy = new ConversationAnswerStrategy(chat, testConfig());

    const events = await collect(
      strategy.answer({
        question: 'Thanks!',
        history: { summary: null, messages: [{ role: 'assistant', content: 'Alice does.' }] },
      }),
    );

    expect(events.every((event) => event.type === 'token')).toBe(true);
    expect(chat.requests[0]?.messages.map((message) => message.content)).toContain('Alice does.');
  });
});
