import type { Message, RetrievedGraph } from '@graph-rag/contracts';
import type { TurnState } from './turn-state';

export interface ConversationTurn {
  question: Message | null;
  answer: Message | null;
}

/** A question opens a turn and the answer closes it. A question can stay without an answer. */
export function groupIntoTurns(messages: Message[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const message of messages) {
    const last = turns.at(-1);
    if (message.role === 'user') {
      turns.push({ question: message, answer: null });
    } else if (last !== undefined && last.answer === null) {
      last.answer = message;
    } else {
      turns.push({ question: null, answer: message });
    }
  }
  return turns;
}

export function hasGraph(message: Message): boolean {
  return (message.metadata?.graph?.nodes.length ?? 0) > 0;
}

export function isChatEmpty(messages: Message[], turn: TurnState, isLoading: boolean): boolean {
  return !isLoading && messages.length === 0 && turn.question === null;
}

export type LivePlace = 'none' | 'new-turn' | 'last-turn';

/**
 * Where the streaming answer goes. A reload can bring in its saved question before the answer is
 * done, and then the two share a turn. The same question can also be asked twice, and then only
 * the text says whether the last saved answer is this one.
 */
export function findLivePlace(turns: ConversationTurn[], turn: TurnState): LivePlace {
  if (turn.question === null) {
    return 'none';
  }
  const last = turns.at(-1);
  if (last?.question?.content !== turn.question) {
    return 'new-turn';
  }
  if (last.answer === null) {
    return 'last-turn';
  }
  return last.answer.content.trim() === turn.text.trim() ? 'none' : 'new-turn';
}

/** The answer whose graph is on screen: the chosen one, or else the latest with a graph. */
export function findActiveAnswer(
  messages: Message[],
  selectedMessageId: number | null,
): Message | null {
  const selected = messages.find((message) => message.id === selectedMessageId);
  return selected && hasGraph(selected) ? selected : (messages.findLast(hasGraph) ?? null);
}

/** The graph being retrieved right now wins over any saved answer. */
export function selectGraph(
  turn: TurnState,
  messages: Message[],
  selectedMessageId: number | null,
): RetrievedGraph | null {
  if (turn.isStreaming) {
    return turn.graph;
  }
  return findActiveAnswer(messages, selectedMessageId)?.metadata?.graph ?? null;
}
