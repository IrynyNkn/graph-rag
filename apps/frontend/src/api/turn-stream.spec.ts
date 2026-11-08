import type { TurnEvent } from '@graph-rag/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './http';
import { readTurnEvents, streamTurn } from './turn-stream';

function streamOf(parts: string[]): ReadableStream<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      parts.forEach((part) => controller.enqueue(encoder.encode(part)));
      controller.close();
    },
  });
}

async function collect(events: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const collected: TurnEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

const frame = (event: TurnEvent) => `data: ${JSON.stringify(event)}\n\n`;

describe('readTurnEvents', () => {
  it('parses frames as they arrive', async () => {
    const events = await collect(
      readTurnEvents(
        streamOf([
          frame({ type: 'token', text: 'a' }) + frame({ type: 'token', text: 'b' }),
          frame({ type: 'error', message: 'c' }),
        ]),
      ),
    );

    expect(events).toEqual([
      { type: 'token', text: 'a' },
      { type: 'token', text: 'b' },
      { type: 'error', message: 'c' },
    ]);
  });

  it('joins a frame split across network chunks', async () => {
    const whole = frame({ type: 'token', text: 'split' });
    const middle = Math.floor(whole.length / 2);

    const events = await collect(
      readTurnEvents(streamOf([whole.slice(0, middle), whole.slice(middle)])),
    );

    expect(events).toEqual([{ type: 'token', text: 'split' }]);
  });

  it('keeps multi-byte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode(frame({ type: 'token', text: 'Привіт' }));
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        bytes.forEach((byte) => controller.enqueue(new Uint8Array([byte])));
        controller.close();
      },
    });

    await expect(collect(readTurnEvents(body))).resolves.toEqual([
      { type: 'token', text: 'Привіт' },
    ]);
  });

  it('ignores anything that is not a data frame', async () => {
    const events = await collect(readTurnEvents(streamOf([': keep-alive\n\n'])));

    expect(events).toEqual([]);
  });

  it('rejects an event it does not know', async () => {
    await expect(
      collect(readTurnEvents(streamOf(['data: {"type":"unknown"}\n\n']))),
    ).rejects.toThrow();
  });
});

describe('streamTurn', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the question and yields the events', async () => {
    const fetchMock = vi.fn(
      async () => new Response(streamOf([frame({ type: 'token', text: 'a' })])),
    );
    vi.stubGlobal('fetch', fetchMock);

    const events = await collect(
      streamTurn('id', { content: 'Question?' }, new AbortController().signal),
    );

    expect(events).toEqual([{ type: 'token', text: 'a' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/assistant/conversations/id/turns',
      expect.objectContaining({ method: 'POST', body: '{"content":"Question?"}' }),
    );
  });

  it('says which question a turn asks again', async () => {
    const fetchMock = vi.fn(async () => new Response(streamOf([])));
    vi.stubGlobal('fetch', fetchMock);

    await collect(
      streamTurn(
        'id',
        { content: 'Edited?', replacesFromMessageId: 3 },
        new AbortController().signal,
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/assistant/conversations/id/turns',
      expect.objectContaining({ body: '{"content":"Edited?","replacesFromMessageId":3}' }),
    );
  });

  it('throws the message of the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ message: 'Conversation gone' }), { status: 404 }),
      ),
    );

    await expect(
      collect(streamTurn('id', { content: 'Question?' }, new AbortController().signal)),
    ).rejects.toThrow(new ApiError('Conversation gone'));
  });

  it('falls back to the status when the error has no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('oops', { status: 502 })),
    );

    await expect(
      collect(streamTurn('id', { content: 'Question?' }, new AbortController().signal)),
    ).rejects.toThrow('status 502');
  });
});
