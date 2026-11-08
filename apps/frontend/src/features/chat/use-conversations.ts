import type { ConversationDetails } from '@graph-rag/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createConversation,
  deleteConversation,
  deleteMessagesFrom,
  getConversation,
  listConversations,
} from '../../api/conversations-api';
import { CONVERSATIONS_KEY, conversationKey } from './conversation-keys';
import { dropMessagesFrom } from './turns';

export function useConversations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: CONVERSATIONS_KEY });

  const conversations = useQuery({ queryKey: CONVERSATIONS_KEY, queryFn: listConversations });
  const create = useMutation({ mutationFn: createConversation, onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteConversation, onSuccess: refresh });

  return {
    conversations: conversations.data ?? [],
    error: conversations.error ?? create.error ?? remove.error,
    create: create.mutateAsync,
    remove: remove.mutateAsync,
  };
}

export function useConversation(id: string | undefined) {
  const conversation = useQuery({
    queryKey: conversationKey(id),
    queryFn: () => getConversation(id ?? ''),
    enabled: id !== undefined,
  });
  return {
    messages: conversation.data?.messages ?? [],
    isLoading: conversation.isLoading,
    error: conversation.error,
  };
}

interface Rewind {
  conversationId: string;
  questionId: number;
}

/** Takes a question and what came after it off the screen at once, and then off the server. */
export function useRewind() {
  const client = useQueryClient();
  const rewind = useMutation({
    mutationFn: ({ conversationId, questionId }: Rewind) =>
      deleteMessagesFrom(conversationId, questionId),
    onMutate: ({ conversationId, questionId }: Rewind) => {
      client.setQueryData<ConversationDetails>(
        conversationKey(conversationId),
        (details) => details && dropMessagesFrom(details, questionId),
      );
    },
    onSettled: (_result, _error, { conversationId }) =>
      Promise.all([
        client.invalidateQueries({ queryKey: conversationKey(conversationId) }),
        client.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
      ]),
  });
  return { rewind: rewind.mutate, error: rewind.error };
}
