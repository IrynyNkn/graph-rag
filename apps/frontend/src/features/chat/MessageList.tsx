import type { Message } from '@graph-rag/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EASE_OUT } from '../../app/motion';
import { AnalysisNote } from './AnalysisNote';
import { AnswerFooter } from './AnswerFooter';
import { AnswerText } from './AnswerText';
import { isSearching, type TurnState } from './turn-state';
import { Question, TurnEntry, type TurnActions } from './TurnEntry';
import { findActiveAnswer, findLivePlace, groupIntoTurns } from './turns';
import './MessageList.css';

const ENTRANCE = { opacity: 0, y: 10 };
const SETTLED = { opacity: 1, y: 0 };

interface MessageListProps {
  messages: Message[];
  turn: TurnState;
  isEmpty: boolean;
  selectedMessageId: number | null;
  actions: TurnActions;
  onSelect: (id: number) => void;
  onSourceHover: (chunkId: string | null) => void;
}

export function MessageList({
  messages,
  turn,
  isEmpty,
  selectedMessageId,
  actions,
  onSelect,
  onSourceHover,
}: MessageListProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    const element = scroller.current;
    if (element !== null) {
      element.scrollTop = element.scrollHeight;
    }
    // These say when the content grew, which is the reason to scroll, not what the effect reads.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [messages.length, turn.text, turn.question, turn.isStreaming]);

  const turns = useMemo(() => groupIntoTurns(messages), [messages]);
  const activeId = turn.isStreaming ? null : findActiveAnswer(messages, selectedMessageId)?.id;
  const livePlace = findLivePlace(turns, turn);
  const liveAnswer = turn.isStreaming ? (
    <LiveAnswer turn={turn} onSourceHover={onSourceHover} />
  ) : null;

  return (
    <div ref={scroller} className={isEmpty ? 'timeline is-empty' : 'timeline'}>
      <AnimatePresence initial={false} mode="popLayout">
        {isEmpty && <Invitation key="invitation" />}
      </AnimatePresence>
      {turns.map((item, index) => {
        const isLast = index === turns.length - 1 && livePlace !== 'new-turn';
        return (
          <TurnEntry
            key={item.question?.id ?? item.answer?.id}
            turn={item}
            isActive={item.answer !== null && item.answer.id === activeId}
            isLast={isLast}
            laterTurns={turns.length - index - 1}
            isEditing={item.question !== null && item.question.id === editingId}
            live={livePlace === 'last-turn' && index === turns.length - 1 ? liveAnswer : null}
            actions={actions}
            onSelect={onSelect}
            onEdit={setEditingId}
            onSourceHover={onSourceHover}
          />
        );
      })}
      {livePlace === 'new-turn' && (
        <motion.article
          className="turn"
          initial={ENTRANCE}
          animate={SETTLED}
          transition={{ duration: 0.45, ease: EASE_OUT }}
        >
          <header className="turn-head">
            <Question text={turn.question ?? ''} />
          </header>
          {liveAnswer}
        </motion.article>
      )}
      {turn.error !== null && <p className="chat-error is-inline">{turn.error}</p>}
    </div>
  );
}

function Invitation() {
  return (
    <motion.div
      className="invitation"
      initial={ENTRANCE}
      animate={SETTLED}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <h1>What do your documents know?</h1>
      <p>Ask a question, and see the part of the knowledge graph behind its answer.</p>
    </motion.div>
  );
}

interface LiveAnswerProps {
  turn: TurnState;
  onSourceHover: (chunkId: string | null) => void;
}

function LiveAnswer({ turn, onSourceHover }: LiveAnswerProps) {
  return (
    <div className="turn-answer">
      <AnalysisNote question={turn.question} analysis={turn.analysis} isLive />
      {turn.text ? (
        <AnswerText text={turn.text} isLive />
      ) : (
        <span className="shimmer">
          {isSearching(turn) ? 'Looking through the graph' : 'Writing the answer'}
        </span>
      )}
      <AnswerFooter citations={turn.citations} onSourceHover={onSourceHover} />
    </div>
  );
}
