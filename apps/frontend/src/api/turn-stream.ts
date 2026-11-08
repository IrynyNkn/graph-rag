import { turnEventSchema, type SendMessageRequest, type TurnEvent } from '@graph-rag/contracts';
import { CONVERSATIONS_URL } from './conversations-api';
import { ApiError, send } from './http';

const FRAME_SEPARATOR = '\n\n';
const DATA_PREFIX = 'data: ';

/** Uses fetch with a readable stream, because EventSource cannot send a POST. */
export async function* streamTurn(
  conversationId: string,
  request: SendMessageRequest,
  signal: AbortSignal,
): AsyncGenerator<TurnEvent> {
  const response = await send(`${CONVERSATIONS_URL}/${conversationId}/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (response.body === null) {
    throw new ApiError('The server sent no answer stream');
  }
  yield* readTurnEvents(response.body);
}

export async function* readTurnEvents(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
): AsyncGenerator<TurnEvent> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      buffer += read.value;
      const frames = buffer.split(FRAME_SEPARATOR);
      buffer = frames.pop() ?? '';
      yield* frames.flatMap(parseFrame);
    }
  } finally {
    await reader.cancel();
  }
}

function parseFrame(frame: string): TurnEvent[] {
  if (!frame.startsWith(DATA_PREFIX)) {
    return [];
  }
  return [turnEventSchema.parse(JSON.parse(frame.slice(DATA_PREFIX.length)))];
}
