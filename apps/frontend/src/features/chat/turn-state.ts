import type { Citation, RetrievedGraph, TurnEvent } from '@graph-rag/contracts';

export interface TurnState {
  conversationId: string | null;
  question: string | null;
  text: string;
  graph: RetrievedGraph | null;
  citations: Citation[];
  error: string | null;
  isStreaming: boolean;
}

export const IDLE_TURN: TurnState = {
  conversationId: null,
  question: null,
  text: '',
  graph: null,
  citations: [],
  error: null,
  isStreaming: false,
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
    case 'done':
      return state;
  }
}

/** The saved messages take over from the streamed copy, and only an error stays on screen. */
export function finishTurn(state: TurnState): TurnState {
  return { ...IDLE_TURN, conversationId: state.conversationId, error: state.error };
}
