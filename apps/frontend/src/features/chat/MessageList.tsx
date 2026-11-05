import type { Citation, Message } from '@graph-rag/contracts';
import { useEffect, useRef } from 'react';
import type { TurnState } from './turn-state';
import { findActiveAnswer, groupIntoTurns, hasGraph, type ConversationTurn } from './turns';
import './MessageList.css';

const LONG_QUESTION_CHARS = 140;

interface MessageListProps {
  messages: Message[];
  turn: TurnState;
  isLoading: boolean;
  selectedMessageId: number | null;
  onSelect: (id: number) => void;
}

export function MessageList({
  messages,
  turn,
  isLoading,
  selectedMessageId,
  onSelect,
}: MessageListProps) {
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
    // These say when the content grew, which is the reason to scroll, not what the effect reads.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [messages.length, turn.text, turn.question]);

  const turns = groupIntoTurns(messages);
  const activeId = turn.isStreaming ? null : findActiveAnswer(messages, selectedMessageId)?.id;
  const showsPendingQuestion =
    turn.question !== null && turns.at(-1)?.question?.content !== turn.question;
  const isEmpty = !isLoading && turns.length === 0 && turn.question === null;

  return (
    <div className={`timeline${isEmpty ? ' is-empty' : ''}`}>
      {isEmpty && <h1 className="timeline-empty">What do your documents know?</h1>}
      {turns.map((item, index) => (
        <TurnEntry
          key={item.question?.id ?? item.answer?.id}
          turn={item}
          isActive={item.answer !== null && item.answer.id === activeId}
          isLatest={!showsPendingQuestion && index === turns.length - 1}
          onSelect={onSelect}
        />
      ))}
      {showsPendingQuestion && (
        <div className="turn is-latest">
          <Question text={turn.question ?? ''} />
        </div>
      )}
      {turn.isStreaming && (
        <div className="turn-answer is-streaming">
          {turn.text ? (
            <AnswerText text={turn.text} />
          ) : (
            <span className="timeline-waiting">Looking through the graph</span>
          )}
          <Sources citations={turn.citations} />
        </div>
      )}
      {turn.error !== null && <p className="timeline-error">{turn.error}</p>}
      <div ref={end} />
    </div>
  );
}

interface TurnEntryProps {
  turn: ConversationTurn;
  isActive: boolean;
  isLatest: boolean;
  onSelect: (id: number) => void;
}

function TurnEntry({ turn, isActive, isLatest, onSelect }: TurnEntryProps) {
  const { question, answer } = turn;
  const canSelect = answer !== null && hasGraph(answer);
  const classes = [
    'turn',
    isActive && 'is-active',
    isLatest && 'is-latest',
    canSelect && 'can-select',
  ];
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      onClick={canSelect ? () => onSelect(answer.id) : undefined}
    >
      {question && <Question text={question.content} />}
      {answer && (
        <div className="turn-answer">
          <AnswerText text={answer.content} />
          <Sources citations={answer.metadata?.citations ?? []} />
        </div>
      )}
    </div>
  );
}

function Question({ text }: { text: string }) {
  const isLong = text.length > LONG_QUESTION_CHARS;
  return <h2 className={isLong ? 'turn-question is-long' : 'turn-question'}>{text}</h2>;
}

/** Answers are plain text by prompt, but a model can still bold a word, and history keeps it. */
function AnswerText({ text }: { text: string }) {
  return text
    .split(/\*\*(.+?)\*\*/)
    .map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part));
}

function Sources({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) {
    return null;
  }
  return (
    <details className="sources" onClick={(event) => event.stopPropagation()}>
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
