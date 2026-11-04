import type { Citation, Message } from '@graph-rag/contracts';
import { useEffect, useRef } from 'react';
import type { TurnState } from './turn-state';

interface MessageListProps {
  messages: Message[];
  turn: TurnState;
  selectedMessageId: number | null;
  onSelect: (id: number) => void;
}

export function MessageList({ messages, turn, selectedMessageId, onSelect }: MessageListProps) {
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
    // These say when the content grew, which is the reason to scroll, not what the effect reads.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [messages.length, turn.text, turn.question]);

  const isEmpty = messages.length === 0 && turn.question === null;
  return (
    <div className="messages">
      {isEmpty && <p className="muted">Ask a question about your documents.</p>}
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isSelected={message.id === selectedMessageId}
          onSelect={onSelect}
        />
      ))}
      {turn.question !== null && !messages.some(isSameQuestion(turn.question)) && (
        <div className="message message-user">{turn.question}</div>
      )}
      {turn.isStreaming && (
        <div className="message message-assistant">
          {turn.text || <span className="muted">Thinking...</span>}
          <Citations citations={turn.citations} />
        </div>
      )}
      {turn.error !== null && <p className="error">{turn.error}</p>}
      <div ref={end} />
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  isSelected: boolean;
  onSelect: (id: number) => void;
}

function MessageBubble({ message, isSelected, onSelect }: MessageBubbleProps) {
  if (message.role === 'user') {
    return <div className="message message-user">{message.content}</div>;
  }
  const hasGraph = (message.metadata?.graph?.nodes.length ?? 0) > 0;
  return (
    <div
      className={`message message-assistant${isSelected ? ' message-selected' : ''}`}
      onClick={hasGraph ? () => onSelect(message.id) : undefined}
    >
      {message.content}
      <Citations citations={message.metadata?.citations ?? []} />
    </div>
  );
}

function Citations({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) {
    return null;
  }
  return (
    <details className="citations">
      <summary>Sources ({citations.length})</summary>
      {citations.map((citation) => (
        <blockquote key={citation.chunkId}>
          <cite>{citation.documentName}</cite>
          {citation.text}
        </blockquote>
      ))}
    </details>
  );
}

/** While the turn runs, the saved copy of the question may already have arrived. */
function isSameQuestion(question: string) {
  return (message: Message, index: number, messages: Message[]) =>
    index === messages.length - 1 && message.role === 'user' && message.content === question;
}
