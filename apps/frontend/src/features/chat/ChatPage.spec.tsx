import type {
  Conversation,
  ConversationDetails,
  Message,
  RetrievedGraph,
} from '@graph-rag/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';

// The real one has its own spec, and needs a measured panel, which the test DOM does not have.
vi.mock('../graph/GraphView', () => ({
  GraphView: ({ graph, isSearching }: { graph: RetrievedGraph | null; isSearching: boolean }) => (
    <div data-testid="graph" data-searching={isSearching}>
      {graph?.nodes.map((node) => node.name).join(',') ?? 'no graph'}
    </div>
  ),
}));

const ID = '6a3f3f62-0a4c-4f7e-9a53-000000000001';
const OTHER_ID = '6a3f3f62-0a4c-4f7e-9a53-000000000002';
const TIMESTAMP = '2026-01-01T00:00:00.000Z';

const conversation: Conversation = {
  id: ID,
  title: 'Who manages?',
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const graph: RetrievedGraph = {
  nodes: [{ name: 'alice', type: 'PERSON', description: null, activation: 1, isSeed: true }],
  edges: [],
};

const citation = {
  chunkId: `${ID}:0`,
  documentId: ID,
  documentName: 'handbook.txt',
  text: 'Alice manages the team.',
};

const answered: ConversationDetails = {
  ...conversation,
  messages: [
    { id: 1, role: 'user', content: 'Who manages?', metadata: null, createdAt: TIMESTAMP },
    {
      id: 2,
      role: 'assistant',
      content: 'Alice does.',
      createdAt: TIMESTAMP,
      metadata: {
        route: 'knowledge_base',
        standaloneQuestion: 'Who manages?',
        graph,
        citations: [citation],
      },
    },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function sse(events: unknown[]): Response {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(text, { headers: { 'Content-Type': 'text/event-stream' } });
}

describe('ChatPage', () => {
  let details: ConversationDetails;
  let turnEvents: unknown[];

  function renderPage(path: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Link to={`/chat/${OTHER_ID}`}>Go to the other</Link>
          <Routes>
            <Route path="/chat/:conversationId?" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  const sendButton = () => screen.getByRole<HTMLButtonElement>('button', { name: /^Ask/ });

  beforeEach(() => {
    details = { ...conversation, messages: [] };
    turnEvents = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/turns')) {
          details = answered;
          return sse(turnEvents);
        }
        if (url.endsWith('/conversations')) {
          return init?.method === 'POST' ? json(conversation) : json([conversation]);
        }
        return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : json(details);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('invites a question in a new chat', async () => {
    renderPage('/chat');

    expect(await screen.findByText(/What do your documents know/)).toBeTruthy();
    expect(screen.getByTestId('graph').textContent).toBe('no graph');
  });

  it('does not flash the invitation while a saved conversation loads', async () => {
    details = answered;

    renderPage(`/chat/${ID}`);

    expect(screen.queryByText(/What do your documents know/)).toBeNull();
    expect(await screen.findByText(/Alice does\./)).toBeTruthy();
    expect(screen.queryByText(/What do your documents know/)).toBeNull();
  });

  it('keeps the last graph on screen until the next conversation has loaded', async () => {
    details = answered;
    let finishLoading = (_response: Response) => {};
    renderPage(`/chat/${ID}`);
    await waitFor(() => expect(screen.getByTestId('graph').textContent).toBe('alice'));
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => (finishLoading = resolve)));

    fireEvent.click(screen.getByText('Go to the other'));

    expect(screen.getByTestId('graph').textContent).toBe('alice');
    finishLoading(json({ ...conversation, id: OTHER_ID, messages: [] }));
    await waitFor(() => expect(screen.getByTestId('graph').textContent).toBe('no graph'));
  });

  it('shows saved messages, the graph of the latest answer, and sources on demand', async () => {
    details = answered;

    renderPage(`/chat/${ID}`);

    expect(await screen.findByText(/Alice does\./)).toBeTruthy();
    expect(screen.getByTestId('graph').textContent).toBe('alice');
    expect(screen.queryByText('Alice manages the team.')).toBeNull();

    fireEvent.click(screen.getByText('Sources (1)'));
    expect(screen.getByText('Alice manages the team.')).toBeTruthy();
    expect(screen.getByText('handbook.txt')).toBeTruthy();

    fireEvent.click(screen.getByText('Sources (1)'));
    await waitFor(() => expect(screen.queryByText('Alice manages the team.')).toBeNull());
  });

  it('shows a bolded word in an answer as bold, without its asterisks', async () => {
    details = {
      ...answered,
      messages: [
        answered.messages[0] as Message,
        { ...(answered.messages[1] as Message), content: 'It is **Alice** who does.' },
      ],
    };

    renderPage(`/chat/${ID}`);

    expect((await screen.findByText('Alice')).tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it('creates a conversation on the first question and shows the saved answer', async () => {
    turnEvents = [
      { type: 'analysis', route: 'knowledge_base', standaloneQuestion: 'Who manages?' },
      { type: 'graph', graph },
      { type: 'token', text: 'Alice does.' },
      { type: 'citations', citations: [citation] },
      { type: 'done', message: answered.messages[1] },
    ];
    renderPage('/chat');

    fireEvent.change(screen.getByPlaceholderText(/Ask about/), {
      target: { value: 'Who manages?' },
    });
    fireEvent.click(sendButton());

    expect(await screen.findByText(/Alice does\./)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('graph').textContent).toBe('alice'));
    await waitFor(() => expect(screen.getAllByText('Who manages?').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByText(/What do your documents know/)).toBeNull());
  });

  it('shows the state of a turn while it runs, and word by word', async () => {
    let writeEvents = (_events: unknown[]) => {};
    let finishStream = () => {};
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (!String(url).endsWith('/turns')) {
        return String(url).endsWith('/conversations') ? json([conversation]) : json(details);
      }
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          writeEvents = (events) => {
            const frames = events.map((event) => `data: ${JSON.stringify(event)}\n\n`);
            controller.enqueue(encoder.encode(frames.join('')));
          };
          finishStream = () => controller.close();
        },
      });
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    renderPage(`/chat/${ID}`);

    fireEvent.change(await screen.findByPlaceholderText(/Ask about/), {
      target: { value: 'Who manages?' },
    });
    fireEvent.click(sendButton());

    expect(await screen.findByText('Looking through the graph')).toBeTruthy();
    expect(screen.getByTestId('graph').dataset.searching).toBe('true');
    expect(sendButton().disabled).toBe(true);

    writeEvents([{ type: 'graph', graph }]);
    expect(await screen.findByText('Writing the answer')).toBeTruthy();
    expect(screen.getByTestId('graph').dataset.searching).toBe('false');

    writeEvents([{ type: 'token', text: 'Alice **does' }]);
    const word = await screen.findByText('does');
    expect(word.classList).toContain('word');

    finishStream();
    await waitFor(() => expect(sendButton().disabled).toBe(true));
  });

  it('shows an error from the stream', async () => {
    turnEvents = [{ type: 'error', message: 'The model is down' }];
    renderPage(`/chat/${ID}`);

    fireEvent.change(await screen.findByPlaceholderText(/Ask about/), {
      target: { value: 'Who manages?' },
    });
    fireEvent.click(sendButton());

    expect(await screen.findByText('The model is down')).toBeTruthy();
  });

  it('shows why a conversation could not be loaded', async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).endsWith('/conversations')
        ? json([conversation])
        : json({ message: 'Not found' }, 404),
    );

    renderPage(`/chat/${ID}`);

    expect(await screen.findByText('Not found')).toBeTruthy();
  });

  it('sends with Enter and keeps a blank message from going out', async () => {
    renderPage(`/chat/${ID}`);
    const composer = await screen.findByPlaceholderText(/Ask about/);

    expect(sendButton().disabled).toBe(true);
    fireEvent.change(composer, { target: { value: 'Hello' } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/assistant/conversations/${ID}/turns`,
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('adds a line with Shift and Enter', async () => {
    renderPage(`/chat/${ID}`);
    const composer = await screen.findByPlaceholderText(/Ask about/);

    fireEvent.change(composer, { target: { value: 'Hello' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });

    expect(fetch).not.toHaveBeenCalledWith(
      `/api/assistant/conversations/${ID}/turns`,
      expect.anything(),
    );
  });

  it('shows the graph of an older answer when it is chosen', async () => {
    const olderGraph: RetrievedGraph = {
      nodes: [{ name: 'bob', type: null, description: null, activation: 1, isSeed: true }],
      edges: [],
    };
    details = {
      ...answered,
      messages: [
        { id: 3, role: 'user', content: 'Older?', metadata: null, createdAt: TIMESTAMP },
        {
          id: 4,
          role: 'assistant',
          content: 'Older answer.',
          createdAt: TIMESTAMP,
          metadata: {
            route: 'knowledge_base',
            standaloneQuestion: 'Older?',
            graph: olderGraph,
            citations: [],
          },
        },
        ...answered.messages,
      ],
    };
    renderPage(`/chat/${ID}`);
    await waitFor(() => expect(screen.getByTestId('graph').textContent).toBe('alice'));

    fireEvent.click(screen.getByText(/Older answer\./));

    expect(screen.getByTestId('graph').textContent).toBe('bob');
    expect(screen.getByText('Older?').closest('.turn')?.classList).toContain('is-active');
  });

  it('keeps a pasted paragraph out of the display size', async () => {
    const paragraph = 'Who manages the team? '.repeat(10);
    details = {
      ...answered,
      messages: [
        { ...(answered.messages[0] as Message), content: paragraph },
        answered.messages[1] as Message,
      ],
    };
    renderPage(`/chat/${ID}`);

    const question = await screen.findByRole('heading', { name: paragraph.trim() });

    expect(question.classList).toContain('is-long');
  });
});
