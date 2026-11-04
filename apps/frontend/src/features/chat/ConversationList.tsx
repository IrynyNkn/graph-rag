import type { Conversation } from '@graph-rag/contracts';
import { NavLink } from 'react-router';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | undefined;
  onNew: () => void;
  onRemove: (id: string) => void;
}

export function ConversationList({
  conversations,
  activeId,
  onNew,
  onRemove,
}: ConversationListProps) {
  return (
    <aside className="conversations">
      <button type="button" className="button button-primary" onClick={onNew}>
        New chat
      </button>
      <ul>
        {conversations.map((conversation) => (
          <li key={conversation.id} className={conversation.id === activeId ? 'active' : ''}>
            <NavLink to={`/chat/${conversation.id}`}>{conversation.title ?? 'New chat'}</NavLink>
            <button
              type="button"
              className="icon-button"
              aria-label={`Delete ${conversation.title ?? 'chat'}`}
              onClick={() => onRemove(conversation.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
