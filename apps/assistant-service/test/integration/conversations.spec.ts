import {
  conversationDetailsSchema,
  conversationSchema,
  turnEventSchema,
  type TurnEvent,
} from '@graph-rag/contracts';
import { GraphStore } from '@graph-rag/graph-store';
import { ChatModel, Embedder, ModelUnavailableError, type ChatRequest } from '@graph-rag/inference';
import { conversations, RelationalStore } from '@graph-rag/relational-store';
import { FakeChatModel, FakeEmbedder } from '@graph-rag/testing';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { testConfig } from '../test-config.js';

const QUESTION_VECTOR = [1, 0, 0];

describe('conversations API', () => {
  const stores = inject('stores');
  let app: INestApplication;
  let graph: GraphStore;
  let relational: RelationalStore;
  let respond: (request: ChatRequest) => unknown;

  const chat = new FakeChatModel((chatRequest) => respond(chatRequest));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.forRoot(
          testConfig({
            POSTGRES_URL: stores.postgresUrl,
            NEO4J_URI: stores.neo4j.uri,
            NEO4J_USER: stores.neo4j.user,
            NEO4J_PASSWORD: stores.neo4j.password,
          }),
        ),
      ],
    })
      .overrideProvider(ChatModel)
      .useValue(chat)
      .overrideProvider(Embedder)
      .useValue(new FakeEmbedder(3, new Map([['Who manages the team?', QUESTION_VECTOR]])))
      .compile();
    moduleRef.useLogger(false);
    app = moduleRef.createNestApplication();
    await app.init();
    graph = app.get(GraphStore);
    relational = app.get(RelationalStore);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    chat.requests.length = 0;
    respond = replyAs({ entities: [{ name: 'alice', searchHint: 'alice' }] }, 'Alice does.');
    await graph.write('MATCH (n) DETACH DELETE n');
    await relational.db.delete(conversations);
  });

  /** Structured requests get the reply, and the streamed answer gets the text. */
  function replyAs(structured: unknown, answer: string) {
    return (chatRequest: ChatRequest): unknown =>
      chatRequest.temperature === 0 ? structured : answer;
  }

  async function createConversation(): Promise<string> {
    const { body } = await request(app.getHttpServer()).post('/conversations').expect(201);
    return conversationSchema.parse(body).id;
  }

  async function sendTurn(id: string, content: string): Promise<TurnEvent[]> {
    const response = await request(app.getHttpServer())
      .post(`/conversations/${id}/turns`)
      .send({ content })
      .expect(201)
      .expect('Content-Type', /text\/event-stream/);
    return response.text
      .split('\n\n')
      .filter((frame) => frame.startsWith('data: '))
      .map((frame) => turnEventSchema.parse(JSON.parse(frame.slice('data: '.length))));
  }

  async function createKnowledge(): Promise<void> {
    await graph.write(`
      CREATE (alice:Entity {
        name: 'alice', type: 'PERSON', description: 'Alice manages the team.',
        revision: 1, refreshedRevision: 1
      })
      CREATE (team:Entity {
        name: 'team', type: 'TEAM', description: 'The team.',
        revision: 1, refreshedRevision: 1
      })
      CREATE (alice)-[:RELATES_TO {relations: ['manages'], chunkIds: ['doc:0']}]->(team)
      CREATE (chunk:Chunk {
        id: 'doc:0', documentId: 'doc', documentName: 'handbook.txt', ordinal: 0,
        text: 'Alice manages the team.'
      })
      CREATE (chunk)-[:MENTIONS {description: 'Alice manages the team.'}]->(alice)
      CREATE (chunk)-[:MENTIONS {description: 'The team.'}]->(team)
      WITH alice, team
      CALL db.create.setNodeVectorProperty(alice, 'descriptionEmbedding', [0.9, 0.1, 0.0])
      CALL db.create.setNodeVectorProperty(team, 'descriptionEmbedding', [0.6, 0.8, 0.0])
    `);
  }

  it('creates, lists, reads and deletes conversations', async () => {
    const id = await createConversation();

    const list = await request(app.getHttpServer()).get('/conversations').expect(200);
    expect(
      conversationSchema
        .array()
        .parse(list.body)
        .map((item) => item.id),
    ).toEqual([id]);

    const details = await request(app.getHttpServer()).get(`/conversations/${id}`).expect(200);
    expect(conversationDetailsSchema.parse(details.body).messages).toEqual([]);

    await request(app.getHttpServer()).delete(`/conversations/${id}`).expect(204);
    await request(app.getHttpServer()).get(`/conversations/${id}`).expect(404);
    await request(app.getHttpServer()).delete(`/conversations/${id}`).expect(404);
  });

  it('validates input', async () => {
    const id = await createConversation();

    await request(app.getHttpServer()).get('/conversations/not-a-uuid').expect(400);
    await request(app.getHttpServer())
      .post(`/conversations/${id}/turns`)
      .send({ content: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/conversations/6a3f3f62-0a4c-4f7e-9a53-000000000000/turns')
      .send({ content: 'Hello' })
      .expect(404);
  });

  it('streams a turn over SSE with the graph, the answer and citations', async () => {
    await createKnowledge();
    const id = await createConversation();

    const events = await sendTurn(id, 'Who manages the team?');

    expect(events.map((event) => event.type)).toEqual([
      'analysis',
      'graph',
      'token',
      'token',
      'citations',
      'done',
    ]);
    const graphEvent = events.find((event) => event.type === 'graph');
    expect(graphEvent).toMatchObject({
      graph: {
        edges: [{ source: 'alice', target: 'team', relations: ['manages'], chunkIds: ['doc:0'] }],
      },
    });
    const citations = events.find((event) => event.type === 'citations');
    expect(citations).toEqual({
      type: 'citations',
      citations: [
        {
          chunkId: 'doc:0',
          documentId: 'doc',
          documentName: 'handbook.txt',
          text: 'Alice manages the team.',
        },
      ],
    });
    expect(chat.lastPrompt).toContain('alice --[manages]--> team');
  });

  it('keeps the answer and its graph after the document is gone', async () => {
    await createKnowledge();
    const id = await createConversation();
    await sendTurn(id, 'Who manages the team?');

    await graph.write('MATCH (n) DETACH DELETE n');

    const { body } = await request(app.getHttpServer()).get(`/conversations/${id}`).expect(200);
    const details = conversationDetailsSchema.parse(body);
    expect(details.title).toBe('Who manages the team?');
    expect(details.messages.map((message) => [message.role, message.content])).toEqual([
      ['user', 'Who manages the team?'],
      ['assistant', 'Alice does.'],
    ]);
    const metadata = details.messages[1]?.metadata;
    expect(metadata?.graph?.nodes.map((node) => node.name).toSorted()).toEqual(['alice', 'team']);
    expect(metadata?.citations[0]?.text).toBe('Alice manages the team.');
  });

  it('reformulates a follow-up and can answer without retrieval', async () => {
    await createKnowledge();
    const id = await createConversation();
    await sendTurn(id, 'Who manages the team?');
    respond = replyAs({ route: 'conversation', standaloneQuestion: 'Thanks for that.' }, 'Sure.');

    const events = await sendTurn(id, 'Thanks!');

    expect(events.map((event) => event.type)).toEqual(['analysis', 'token', 'done']);
    expect(events[0]).toMatchObject({ route: 'conversation' });
    expect(chat.lastPrompt).toContain('Alice does.');
  });

  it('answers on an empty graph without inventing sources', async () => {
    const id = await createConversation();
    respond = replyAs({ entities: [] }, 'Nothing found.');

    const events = await sendTurn(id, 'Who manages the team?');

    expect(events.find((event) => event.type === 'graph')).toEqual({
      type: 'graph',
      graph: { nodes: [], edges: [] },
    });
    expect(events.find((event) => event.type === 'citations')).toEqual({
      type: 'citations',
      citations: [],
    });
  });

  it('reports a provider outage in the stream', async () => {
    const id = await createConversation();
    respond = () => new ModelUnavailableError('provider down');

    const events = await sendTurn(id, 'Who manages the team?');

    expect(events).toEqual([
      { type: 'analysis', route: 'knowledge_base', standaloneQuestion: 'Who manages the team?' },
      { type: 'error', message: 'provider down' },
    ]);
  });

  it('answers the health check', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });
});
