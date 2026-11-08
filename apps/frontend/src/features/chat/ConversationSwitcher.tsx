import { AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { useMatch, useNavigate } from 'react-router';
import { ChatIcon } from '../../app/icons';
import { shortcutLabel, titleOf } from './conversation-search';
import { ConversationPalette } from './ConversationPalette';
import { useConversations } from './use-conversations';
import './ConversationSwitcher.css';

/** The conversations live in a palette, because a sidebar of chats is what every chat app has. */
export function ConversationSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const activeId = useMatch('/chat/:conversationId')?.params.conversationId;
  const { conversations, remove } = useConversations();
  const active = conversations.find((conversation) => conversation.id === activeId);

  useEffect(() => {
    const toggleOnShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', toggleOnShortcut);
    return () => window.removeEventListener('keydown', toggleOnShortcut);
  }, []);

  // Leaves first: an open conversation would be refetched after the delete, and retried on its 404.
  const handleRemove = async (id: string) => {
    if (id === activeId) {
      navigate('/chat');
    }
    await remove(id);
  };

  return (
    <>
      <button
        type="button"
        className="switcher"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <ChatIcon />
        <span className="switcher-title">{active ? titleOf(active) : 'Conversations'}</span>
        <kbd>{shortcutLabel(navigator.platform)}</kbd>
      </button>
      <AnimatePresence>
        {isOpen && (
          <ConversationPalette
            conversations={conversations}
            activeId={activeId}
            onOpen={(path) => {
              setIsOpen(false);
              navigate(path);
            }}
            onRemove={handleRemove}
            onClose={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
