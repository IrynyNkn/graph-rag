import type { ConversationDetails } from '@graph-rag/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/http';
import { streamTurn } from '../../api/turn-stream';
import { CONVERSATIONS_KEY, conversationKey } from './conversation-keys';
import { applyTurnEvent, finishTurn, IDLE_TURN, startTurn, type TurnState } from './turn-state';
import { dropMessagesFrom } from './turns';

export function useTurn() {
  const client = useQueryClient();
  const [turn, setTurn] = useState<TurnState>(IDLE_TURN);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  /** With `replacesFromMessageId`, asks a question again in place of it and what came after. */
  const send = useCallback(
    async (conversationId: string, question: string, replacesFromMessageId?: number) => {
      const current = new AbortController();
      controller.current = current;
      if (replacesFromMessageId !== undefined) {
        client.setQueryData<ConversationDetails>(
          conversationKey(conversationId),
          (details) => details && dropMessagesFrom(details, replacesFromMessageId),
        );
      }
      setTurn(startTurn(conversationId, question));
      const request = { content: question, replacesFromMessageId };
      try {
        for await (const event of streamTurn(conversationId, request, current.signal)) {
          setTurn((state) => applyTurnEvent(state, event));
        }
      } catch (error) {
        if (!current.signal.aborted) {
          setTurn((state) => ({ ...state, error: errorMessage(error) }));
        }
      }
      if (current.signal.aborted) {
        return;
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: conversationKey(conversationId) }),
        client.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
      ]);
      setTurn(finishTurn);
    },
    [client],
  );

  return { turn, send };
}
