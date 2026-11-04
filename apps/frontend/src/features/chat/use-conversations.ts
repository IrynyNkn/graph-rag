import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
} from '../../api/conversations-api';
import { CONVERSATIONS_KEY, conversationKey } from './conversation-keys';

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
  return { messages: conversation.data?.messages ?? [], error: conversation.error };
}
