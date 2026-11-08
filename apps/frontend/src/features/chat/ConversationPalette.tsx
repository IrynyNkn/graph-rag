import type { Conversation } from '@graph-rag/contracts';
import { motion } from 'motion/react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ConfirmButton } from '../../app/ConfirmButton';
import { CloseIcon, PlusIcon } from '../../app/icons';
import { SNAPPY } from '../../app/motion';
import { describeAge, filterConversations, moveHighlight, titleOf } from './conversation-search';

interface ConversationPaletteProps {
  conversations: Conversation[];
  activeId: string | undefined;
  onOpen: (path: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

const NEW_CHAT_PATH = '/chat';

export function ConversationPalette({
  conversations,
  activeId,
  onOpen,
  onRemove,
  onClose,
}: ConversationPaletteProps) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  // Ages only need to be right as of when the palette opened.
  const [now] = useState(() => new Date());
  const found = filterConversations(conversations, query);
  // A new chat is the first thing on offer, until the user starts looking for an old one.
  const paths = [...(query ? [] : [NEW_CHAT_PATH]), ...found.map((item) => `/chat/${item.id}`)];
  const current = Math.min(highlight, Math.max(paths.length - 1, 0));

  const handleKeyDown = (event: KeyboardEvent) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      setHighlight(moveHighlight(current, step, paths.length));
    } else if (event.key === 'Enter' && paths[current] !== undefined) {
      onOpen(paths[current]);
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  return (
    <motion.div
      className="palette-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.div
        className="palette"
        role="dialog"
        aria-label="Conversations"
        initial={{ opacity: 0, scale: 0.98, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -4, transition: { duration: 0.12 } }}
        transition={SNAPPY}
      >
        <input
          className="palette-search"
          // A palette opens to be typed into.
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={query}
          placeholder="Find a conversation"
          aria-label="Find a conversation"
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <ul className="palette-list">
          {!query && (
            <PaletteRow isHighlighted={current === 0} onPoint={() => setHighlight(0)}>
              <button type="button" className="palette-open" onClick={() => onOpen(NEW_CHAT_PATH)}>
                <PlusIcon />
                <span className="palette-title">New chat</span>
              </button>
            </PaletteRow>
          )}
          {found.map((conversation, index) => {
            const position = index + (query ? 0 : 1);
            return (
              <PaletteRow
                key={conversation.id}
                isHighlighted={current === position}
                onPoint={() => setHighlight(position)}
              >
                <ConversationRow
                  conversation={conversation}
                  now={now}
                  isActive={conversation.id === activeId}
                  onOpen={onOpen}
                  onRemove={onRemove}
                />
              </PaletteRow>
            );
          })}
          {found.length === 0 && <li className="palette-none">Nothing matches.</li>}
        </ul>
        <footer className="palette-hints">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>↵</kbd> to open
          </span>
          <span>
            <kbd>esc</kbd> to close
          </span>
        </footer>
      </motion.div>
    </motion.div>
  );
}

interface PaletteRowProps {
  isHighlighted: boolean;
  onPoint: () => void;
  children: ReactNode;
}

function PaletteRow({ isHighlighted, onPoint, children }: PaletteRowProps) {
  return (
    <li
      className={isHighlighted ? 'palette-row is-highlighted' : 'palette-row'}
      onPointerMove={onPoint}
    >
      {isHighlighted && (
        <motion.span
          layoutId="palette-highlight"
          className="palette-highlight"
          transition={SNAPPY}
        />
      )}
      {children}
    </li>
  );
}

interface ConversationRowProps {
  conversation: Conversation;
  now: Date;
  isActive: boolean;
  onOpen: (path: string) => void;
  onRemove: (id: string) => void;
}

function ConversationRow({ conversation, now, isActive, onOpen, onRemove }: ConversationRowProps) {
  const title = titleOf(conversation);
  return (
    <>
      <button
        type="button"
        className="palette-open"
        onClick={() => onOpen(`/chat/${conversation.id}`)}
      >
        <i className={isActive ? 'palette-dot is-active' : 'palette-dot'} aria-hidden="true" />
        <span className="palette-title">{title}</span>
        <span className="palette-age">{describeAge(conversation.updatedAt, now)}</span>
      </button>
      <ConfirmButton
        label={`Delete ${conversation.title ?? 'chat'}`}
        onConfirm={() => onRemove(conversation.id)}
      >
        <CloseIcon />
      </ConfirmButton>
    </>
  );
}
