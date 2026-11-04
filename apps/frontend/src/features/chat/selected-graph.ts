import type { Message, RetrievedGraph } from '@graph-rag/contracts';
import type { TurnState } from './turn-state';

/** The graph being retrieved right now wins, then the chosen answer, then the latest one. */
export function selectGraph(
  turn: TurnState,
  messages: Message[],
  selectedMessageId: number | null,
): RetrievedGraph | null {
  if (turn.isStreaming) {
    return turn.graph;
  }
  const selected = messages.find((message) => message.id === selectedMessageId);
  if (selected?.metadata?.graph) {
    return selected.metadata.graph;
  }
  return messages.findLast((message) => message.metadata?.graph)?.metadata?.graph ?? null;
}
