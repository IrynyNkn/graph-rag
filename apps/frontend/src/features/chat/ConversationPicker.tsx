import type { Conversation } from '@graph-rag/contracts';
import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router';
import { ConfirmButton } from '../../app/ConfirmButton';
import './ConversationPicker.css';

interface ConversationPickerProps {
  conversations: Conversation[];
  activeId: string | undefined;
  onNew: () => void;
  onRemove: (id: string) => void;
}

export function ConversationPicker({
  conversations,
  activeId,
  onNew,
  onRemove,
}: ConversationPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const active = conversations.find((conversation) => conversation.id === activeId);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [isOpen]);

  return (
    <div ref={container} className="picker">
      <button
        type="button"
        className="picker-toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{active?.title ?? 'All conversations'}</span>
        <span aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
      </button>
      <button type="button" className="picker-new" onClick={onNew}>
        New chat
      </button>
      {isOpen && (
        <ul className="picker-menu">
          {conversations.length === 0 && <li className="picker-none">Nothing yet.</li>}
          {conversations.map((conversation) => (
            <li key={conversation.id} className={conversation.id === activeId ? 'is-active' : ''}>
              <NavLink to={`/chat/${conversation.id}`} onClick={() => setIsOpen(false)}>
                {conversation.title ?? 'New chat'}
              </NavLink>
              <ConfirmButton
                label={`Delete ${conversation.title ?? 'chat'}`}
                onConfirm={() => onRemove(conversation.id)}
              >
                ×
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
