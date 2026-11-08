import type {
  Conversation,
  ConversationDetails,
  Message,
  MessageMetadata,
  RetrievedGraph,
} from '@graph-rag/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';

// The real one has its own spec, and needs a measured panel, which the test DOM does not have.
vi.mock('../graph/GraphView', () => ({
  GraphView: ({
    graph,
    isSearching,
    citations,
    sourceChunkId,
    onAskAbout,
  }: {
    graph: RetrievedGraph | null;
    isSearching: boolean;
    citations: unknown[];
    sourceChunkId: string | null;
    onAskAbout: (name: string) => void;
  }) => (
    <div
      data-testid="graph"
      data-searching={isSearching}
      data-citations={citations.length}
      data-source={sourceChunkId ?? ''}
    >
      {graph?.nodes.map((node) => node.name).join(',') ?? 'no graph'}
      <button type="button" onClick={() => onAskAbout('Search Team')}>
        Point at a node
      </button>
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

  const sendButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Ask' });
  const graphNames = () => screen.getByTestId('graph').firstChild?.textContent;

  /** Keeps a turn running until the test finishes it, and lets it send events on the way. */
  function holdTurn() {
    let write = (_events: unknown[]) => {};
    let finish = () => {};
    vi.mocked(fetch).mockImplementation(async (url) => {
      const path = String(url);
      if (path.endsWith('/turns/stop')) {
        return new Response(null, { status: 204 });
      }
      if (!path.endsWith('/turns')) {
        return path.endsWith('/conversations') ? json([conversation]) : json(details);
      }
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          write = (events) => {
            const frames = events.map((event) => `data: ${JSON.stringify(event)}\n\n`);
            controller.enqueue(encoder.encode(frames.join('')));
          };
          finish = () => controller.close();
        },
      });
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    return { write: (events: unknown[]) => write(events), finish: () => finish() };
  }

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
    expect(graphNames()).toBe('no graph');
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
    await waitFor(() => expect(graphNames()).toBe('alice'));
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => (finishLoading = resolve)));

    fireEvent.click(screen.getByText('Go to the other'));

    expect(graphNames()).toBe('alice');
    finishLoading(json({ ...conversation, id: OTHER_ID, messages: [] }));
    await waitFor(() => expect(graphNames()).toBe('no graph'));
  });

  it('shows saved messages, the graph of the latest answer, and sources on demand', async () => {
    details = answered;

    renderPage(`/chat/${ID}`);

    expect(await screen.findByText(/Alice does\./)).toBeTruthy();
    expect(graphNames()).toBe('alice');
    expect(screen.queryByText('Alice manages the team.')).toBeNull();
    expect(screen.queryByText('Stopped')).toBeNull();
    expect(screen.queryByText(/Searched for/)).toBeNull();

    fireEvent.click(screen.getByText('Sources (1)'));
    expect(screen.getByText('Alice manages the team.')).toBeTruthy();
    expect(screen.getByText('handbook.txt')).toBeTruthy();

    fireEvent.click(screen.getByText('Sources (1)'));
    await waitFor(() => expect(screen.queryByText('Alice manages the team.')).toBeNull());
  });

  it('shows how long an answer took and what wrote it, one panel at a time', async () => {
    details = {
      ...answered,
      messages: [
        answered.messages[0] as Message,
        {
          ...(answered.messages[1] as Message),
          metadata: {
            ...(answered.messages[1]?.metadata as MessageMetadata),
            timings: { analysisMs: 900, searchMs: 400, waitMs: 1100, writingMs: 1800 },
            models: { chat: 'small-chat', embedding: 'small-embedding' },
          },
        },
      ],
    };
    renderPage(`/chat/${ID}`);

    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    fireEvent.click(await screen.findByText('Took 4.2 s'));
    expect(screen.getByText('Searching the graph').nextSibling?.textContent).toBe('400 ms');
    expect(screen.getByText('small-chat')).toBeTruthy();
    expect(screen.getByText('small-embedding')).toBeTruthy();
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Sources (1)'));
    expect(screen.getByText('Alice manages the team.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Searching the graph')).toBeNull());
  });

  describe('copying an answer', () => {
    function stubClipboard(writeText: (text: string) => Promise<void>) {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    }

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'clipboard');
    });

    it('copies the text as it was written, and says so', async () => {
      const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
      stubClipboard(writeText);
      details = {
        ...answered,
        messages: [
          answered.messages[0] as Message,
          { ...(answered.messages[1] as Message), content: 'It is **Alice**.' },
        ],
      };
      renderPage(`/chat/${ID}`);

      fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));

      expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
      expect(writeText).toHaveBeenCalledWith('It is **Alice**.');
    });

    it('says when the browser refused', async () => {
      stubClipboard(vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('No')));
      details = answered;
      renderPage(`/chat/${ID}`);

      fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));

      expect(await screen.findByRole('button', { name: 'Could not copy' })).toBeTruthy();
    });
  });

  it('starts a question about a node of the graph, and adds to one being written', async () => {
    renderPage(`/chat/${ID}`);
    const composer = await screen.findByPlaceholderText<HTMLTextAreaElement>(/Ask about/);

    fireEvent.click(screen.getByText('Point at a node'));

    expect(composer.value).toBe('Tell me about Search Team');
    expect(document.activeElement).toBe(composer);
    expect(fetch).not.toHaveBeenCalledWith(
      `/api/assistant/conversations/${ID}/turns`,
      expect.anything(),
    );

    fireEvent.change(composer, { target: { value: 'Compare it with ' } });
    fireEvent.click(screen.getByText('Point at a node'));

    expect(composer.value).toBe('Compare it with Search Team');
  });

  it('tells the graph its sources and which of them the pointer is on', async () => {
    details = answered;
    renderPage(`/chat/${ID}`);

    fireEvent.click(await screen.findByText('Sources (1)'));
    const source = screen.getByText('Alice manages the team.');
    const panel = screen.getByTestId('graph');
    expect(panel.dataset.citations).toBe('1');

    fireEvent.mouseEnter(source);
    expect(panel.dataset.source).toBe(citation.chunkId);

    fireEvent.mouseLeave(source);
    expect(panel.dataset.source).toBe('');
  });

  it('lets go of a source when its list closes under the pointer', async () => {
    details = answered;
    renderPage(`/chat/${ID}`);
    fireEvent.click(await screen.findByText('Sources (1)'));
    fireEvent.mouseEnter(screen.getByText('Alice manages the team.'));

    fireEvent.click(screen.getByText('Sources (1)'));

    await waitFor(() => expect(screen.getByTestId('graph').dataset.source).toBe(''));
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
    await waitFor(() => expect(graphNames()).toBe('alice'));
    await waitFor(() => expect(screen.getAllByText('Who manages?').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByText(/What do your documents know/)).toBeNull());
  });

  it('shows the state of a turn while it runs, and word by word', async () => {
    const stream = holdTurn();
    renderPage(`/chat/${ID}`);

    fireEvent.change(await screen.findByPlaceholderText(/Ask about/), {
      target: { value: 'Who manages?' },
    });
    fireEvent.click(sendButton());

    expect(await screen.findByText('Looking through the graph')).toBeTruthy();
    expect(screen.getByTestId('graph').dataset.searching).toBe('true');
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();

    stream.write([{ type: 'graph', graph }]);
    expect(await screen.findByText('Writing the answer')).toBeTruthy();
    expect(screen.getByTestId('graph').dataset.searching).toBe('false');

    stream.write([{ type: 'token', text: 'Alice **does' }]);
    const word = await screen.findByText('does');
    expect(word.classList).toContain('word');

    stream.finish();
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
    await waitFor(() => expect(graphNames()).toBe('alice'));

    fireEvent.click(screen.getByText(/Older answer\./));

    expect(graphNames()).toBe('bob');
    expect(screen.getByText('Older?').closest('.turn')?.classList).toContain('is-active');
  });

  describe('changing what was asked', () => {
    const twoTurns: ConversationDetails = {
      ...answered,
      messages: [
        ...answered.messages,
        { id: 3, role: 'user', content: 'And who else?', metadata: null, createdAt: TIMESTAMP },
        {
          id: 4,
          role: 'assistant',
          content: 'Bob does too.',
          metadata: answered.messages[1]?.metadata ?? null,
          createdAt: TIMESTAMP,
        },
      ],
    };

    const turnRequests = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).endsWith('/turns'))
        .map(([, init]) => JSON.parse(String(init?.body)) as unknown);

    it('edits a question, says what that replaces, and asks in its place', async () => {
      details = twoTurns;
      renderPage(`/chat/${ID}`);
      const [firstEdit] = await screen.findAllByRole('button', { name: 'Edit the question' });

      fireEvent.click(firstEdit as HTMLElement);
      expect(screen.getByText('This replaces its answer and the question after it.')).toBeTruthy();
      const editor = screen.getByRole('textbox', { name: 'Question' });
      fireEvent.change(editor, { target: { value: 'Who leads?' } });
      fireEvent.click(within(editor.closest('form') as HTMLElement).getByText('Ask again'));

      expect(screen.queryByText('Bob does too.')).toBeNull();
      await waitFor(() =>
        expect(turnRequests()).toEqual([{ content: 'Who leads?', replacesFromMessageId: 1 }]),
      );
    });

    it('leaves an edit with Escape, and asks nothing', async () => {
      details = twoTurns;
      renderPage(`/chat/${ID}`);
      const [firstEdit] = await screen.findAllByRole('button', { name: 'Edit the question' });

      fireEvent.click(firstEdit as HTMLElement);
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Question' }), { key: 'Escape' });

      expect(screen.queryByRole('textbox', { name: 'Question' })).toBeNull();
      expect(turnRequests()).toEqual([]);
    });

    it('asks the last question again', async () => {
      details = twoTurns;
      renderPage(`/chat/${ID}`);

      fireEvent.click(await screen.findByRole('button', { name: /Ask again/ }));

      await waitFor(() =>
        expect(turnRequests()).toEqual([{ content: 'And who else?', replacesFromMessageId: 3 }]),
      );
    });

    it('offers to ask again a question left without an answer', async () => {
      details = { ...answered, messages: [answered.messages[0] as Message] };
      renderPage(`/chat/${ID}`);

      expect(await screen.findByText(/No answer\./)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /Ask again/ }));

      await waitFor(() =>
        expect(turnRequests()).toEqual([{ content: 'Who manages?', replacesFromMessageId: 1 }]),
      );
    });

    it('deletes a question and everything after it, after asking', async () => {
      details = twoTurns;
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        if (init?.method === 'DELETE') {
          details = { ...twoTurns, messages: twoTurns.messages.slice(0, 2) };
          return new Response(null, { status: 204 });
        }
        return String(url).endsWith('/conversations') ? json([conversation]) : json(details);
      });
      renderPage(`/chat/${ID}`);
      const [, secondDelete] = await screen.findAllByRole('button', {
        name: 'Delete this question and everything after it',
      });

      fireEvent.click(secondDelete as HTMLElement);
      fireEvent.click(screen.getByText('Sure?'));

      await waitFor(() => expect(screen.queryByText('Bob does too.')).toBeNull());
      expect(screen.getByText(/Alice does\./)).toBeTruthy();
      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          `/api/assistant/conversations/${ID}/messages/3`,
          expect.objectContaining({ method: 'DELETE' }),
        ),
      );
    });

    it('hides what changes the conversation while an answer is on its way', async () => {
      details = answered;
      vi.mocked(fetch).mockImplementation(async (url) => {
        if (String(url).endsWith('/turns')) {
          return new Response(new ReadableStream(), {
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }
        return String(url).endsWith('/conversations') ? json([conversation]) : json(details);
      });
      renderPage(`/chat/${ID}`);
      await screen.findByRole('button', { name: 'Edit the question' });

      fireEvent.change(screen.getByPlaceholderText(/Ask about/), {
        target: { value: 'Next?' },
      });
      fireEvent.click(sendButton());

      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Edit the question' })).toBeNull(),
      );
      expect(screen.queryByRole('button', { name: /Ask again/ })).toBeNull();
    });
  });

  describe('how a question was understood', () => {
    const followUp = (route: 'knowledge_base' | 'conversation'): ConversationDetails => ({
      ...answered,
      messages: [
        { id: 1, role: 'user', content: 'And who leads it?', metadata: null, createdAt: TIMESTAMP },
        {
          ...(answered.messages[1] as Message),
          metadata: {
            ...(answered.messages[1]?.metadata as MessageMetadata),
            route,
            standaloneQuestion: 'Who leads the Search Team?',
          },
        },
      ],
    });

    it('says what a follow-up was searched for', async () => {
      details = followUp('knowledge_base');
      renderPage(`/chat/${ID}`);

      expect(
        (await screen.findByText('Who leads the Search Team?')).parentElement?.textContent,
      ).toBe('Searched for Who leads the Search Team?');
    });

    it('says when the conversation was enough', async () => {
      details = followUp('conversation');
      renderPage(`/chat/${ID}`);

      expect(await screen.findByText('Answered from the conversation')).toBeTruthy();
      expect(screen.queryByText(/Searched for/)).toBeNull();
    });

    async function askAndHold() {
      const stream = holdTurn();
      renderPage(`/chat/${ID}`);
      fireEvent.change(await screen.findByPlaceholderText(/Ask about/), {
        target: { value: 'And who leads it?' },
      });
      fireEvent.click(sendButton());
      await screen.findByText('Looking through the graph');
      return stream;
    }

    it('shows what is being searched for as soon as it is known', async () => {
      const stream = await askAndHold();

      stream.write([
        { type: 'analysis', route: 'knowledge_base', standaloneQuestion: 'Who leads the team?' },
      ]);

      expect(await screen.findByText('Who leads the team?')).toBeTruthy();
      expect(screen.getByText('Looking through the graph')).toBeTruthy();
      expect(screen.getByTestId('graph').dataset.searching).toBe('true');
    });

    it('stops looking through the graph once the conversation will answer', async () => {
      details = answered;
      const stream = await askAndHold();
      expect(graphNames()).toBe('no graph');

      stream.write([{ type: 'analysis', route: 'conversation', standaloneQuestion: 'Thanks' }]);

      expect(await screen.findByText('Writing the answer')).toBeTruthy();
      expect(screen.getByTestId('graph').dataset.searching).toBe('false');
      expect(graphNames()).toBe('alice');
    });
  });

  describe('stopping an answer', () => {
    const stopped: ConversationDetails = {
      ...answered,
      messages: [
        answered.messages[0] as Message,
        {
          ...(answered.messages[1] as Message),
          content: 'Alice',
          metadata: { ...(answered.messages[1]?.metadata as MessageMetadata), stopped: true },
        },
      ],
    };

    const composer = () => screen.getByPlaceholderText(/Ask about/);
    const stopButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Stop' });
    const stopRequests = () =>
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/turns/stop'));

    async function askAndHold() {
      const stream = holdTurn();
      renderPage(`/chat/${ID}`);
      fireEvent.change(await screen.findByPlaceholderText(/Ask about/), {
        target: { value: 'Who manages?' },
      });
      fireEvent.click(sendButton());
      await screen.findByRole('button', { name: 'Stop' });
      return stream;
    }

    it('stops the answer being written and shows what the server kept', async () => {
      const stream = await askAndHold();
      stream.write([{ type: 'token', text: 'Alice' }]);

      fireEvent.click(stopButton());

      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Stopping' }).disabled).toBe(
        true,
      );
      expect(fetch).toHaveBeenCalledWith(
        `/api/assistant/conversations/${ID}/turns/stop`,
        expect.objectContaining({ method: 'POST' }),
      );
      details = stopped;
      stream.finish();
      expect(await screen.findByText('Stopped')).toBeTruthy();
      expect(sendButton().disabled).toBe(true);
    });

    it('stops with Escape from the composer, and asks the server only once', async () => {
      await askAndHold();

      fireEvent.keyDown(composer(), { key: 'Escape' });
      fireEvent.keyDown(composer(), { key: 'Escape' });

      expect(stopRequests()).toHaveLength(1);
    });

    it('leaves alone an answer being written in another conversation', async () => {
      await askAndHold();

      fireEvent.click(screen.getByText('Go to the other'));
      fireEvent.change(composer(), { target: { value: 'Next?' } });

      expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
      expect(sendButton().disabled).toBe(true);
      fireEvent.keyDown(composer(), { key: 'Escape' });
      expect(stopRequests()).toHaveLength(0);
    });

    it('says why an answer could not be stopped, and lets the user try again', async () => {
      await askAndHold();
      vi.mocked(fetch).mockImplementation(async () => json({ message: 'Stop failed' }, 500));

      fireEvent.click(stopButton());

      expect(await screen.findByText('Stop failed')).toBeTruthy();
      expect(stopButton().disabled).toBe(false);
    });
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
