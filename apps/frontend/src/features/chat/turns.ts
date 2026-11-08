import type { ConversationDetails, Message, RetrievedGraph } from '@graph-rag/contracts';
import type { TurnState } from './turn-state';

const WORD_BREAKS = /[^\p{L}\p{N}]+/gu;

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

/** What the server keeps after a rewind from this message, for the screen to show at once. */
export function dropMessagesFrom(
  details: ConversationDetails,
  messageId: number,
): ConversationDetails {
  return { ...details, messages: details.messages.filter((message) => message.id < messageId) };
}

/** What asking a question again throws away, said before it happens. */
export function describeLoss(laterTurns: number, hasAnswer: boolean): string {
  if (laterTurns > 0) {
    const questions = laterTurns === 1 ? 'question' : `${laterTurns} questions`;
    return `This replaces its answer and the ${questions} after it.`;
  }
  return hasAnswer ? 'This replaces its answer.' : '';
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

/** The router repeats a clear question as it is, give or take its case and punctuation. */
export function isSameQuestion(asked: string, understood: string): boolean {
  const plain = (text: string) => text.toLowerCase().replace(WORD_BREAKS, ' ').trim();
  return plain(asked) === plain(understood);
}

/** The graph being retrieved right now wins over any saved answer. */
export function selectGraph(
  turn: TurnState,
  messages: Message[],
  selectedMessageId: number | null,
): RetrievedGraph | null {
  if (turn.isStreaming && turn.analysis?.route !== 'conversation') {
    return turn.graph;
  }
  return findActiveAnswer(messages, selectedMessageId)?.metadata?.graph ?? null;
}
