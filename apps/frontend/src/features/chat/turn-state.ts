import type { Citation, MessageMetadata, RetrievedGraph, TurnEvent } from '@graph-rag/contracts';

/** How the question was understood, which a turn learns first and an answer keeps. */
export type TurnAnalysis = Pick<MessageMetadata, 'route' | 'standaloneQuestion'>;

export interface TurnState {
  conversationId: string | null;
  question: string | null;
  analysis: TurnAnalysis | null;
  text: string;
  graph: RetrievedGraph | null;
  citations: Citation[];
  error: string | null;
  isStreaming: boolean;
  /** Asked to stop, and waiting for the server to save what was written. */
  isStopping: boolean;
}

export const IDLE_TURN: TurnState = {
  conversationId: null,
  question: null,
  analysis: null,
  text: '',
  graph: null,
  citations: [],
  error: null,
  isStreaming: false,
  isStopping: false,
};

export function startTurn(conversationId: string, question: string): TurnState {
  return { ...IDLE_TURN, conversationId, question, isStreaming: true };
}

export function applyTurnEvent(state: TurnState, event: TurnEvent): TurnState {
  switch (event.type) {
    case 'graph':
      return { ...state, graph: event.graph };
    case 'token':
      return { ...state, text: state.text + event.text };
    case 'citations':
      return { ...state, citations: event.citations };
    case 'error':
      return { ...state, error: event.message };
    case 'analysis':
      return {
        ...state,
        analysis: { route: event.route, standaloneQuestion: event.standaloneQuestion },
      };
    case 'done':
      return state;
  }
}

/** A turn answered from the conversation never goes looking through the graph. */
export function isSearching(turn: TurnState): boolean {
  return turn.isStreaming && turn.graph === null && turn.analysis?.route !== 'conversation';
}

/** The saved messages take over from the streamed copy, and only an error stays on screen. */
export function finishTurn(state: TurnState): TurnState {
  return { ...IDLE_TURN, conversationId: state.conversationId, error: state.error };
}
