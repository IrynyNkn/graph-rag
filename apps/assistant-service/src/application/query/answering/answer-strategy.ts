import type { QueryRoute, TurnEvent } from '@graph-rag/contracts';
import type { ConversationHistory } from '../../conversations/conversation-history.js';

export const ANSWER_STRATEGIES = Symbol('ANSWER_STRATEGIES');

export type AnswerEvent = Extract<TurnEvent, { type: 'graph' | 'token' | 'citations' }>;

export interface AnswerRequest {
  question: string;
  history: ConversationHistory;
}

export abstract class AnswerStrategy {
  abstract supports(route: QueryRoute): boolean;
  abstract answer(request: AnswerRequest): AsyncIterable<AnswerEvent>;
}
