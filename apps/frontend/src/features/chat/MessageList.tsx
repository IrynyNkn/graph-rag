import type { Message } from '@graph-rag/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { EASE_OUT, SNAPPY } from '../../app/motion';
import { AnswerText } from './AnswerText';
import { Sources } from './Sources';
import type { TurnState } from './turn-state';
import {
  findActiveAnswer,
  findLivePlace,
  groupIntoTurns,
  hasGraph,
  type ConversationTurn,
} from './turns';
import './MessageList.css';

const LONG_QUESTION_CHARS = 140;
const ENTRANCE = { opacity: 0, y: 10 };
const SETTLED = { opacity: 1, y: 0 };

interface MessageListProps {
  messages: Message[];
  turn: TurnState;
  isEmpty: boolean;
  selectedMessageId: number | null;
  onSelect: (id: number) => void;
}

export function MessageList({
  messages,
  turn,
  isEmpty,
  selectedMessageId,
  onSelect,
}: MessageListProps) {
  const scroller = useRef<HTMLDivElement>(null);

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
  const liveAnswer = turn.isStreaming ? <LiveAnswer turn={turn} /> : null;

  return (
    <div ref={scroller} className={isEmpty ? 'timeline is-empty' : 'timeline'}>
      <AnimatePresence initial={false} mode="popLayout">
        {isEmpty && <Invitation key="invitation" />}
      </AnimatePresence>
      {turns.map((item, index) => (
        <TurnEntry
          key={item.question?.id ?? item.answer?.id}
          turn={item}
          isActive={item.answer !== null && item.answer.id === activeId}
          live={livePlace === 'last-turn' && index === turns.length - 1 ? liveAnswer : null}
          onSelect={onSelect}
        />
      ))}
      {livePlace === 'new-turn' && (
        <motion.article
          className="turn"
          initial={ENTRANCE}
          animate={SETTLED}
          transition={{ duration: 0.45, ease: EASE_OUT }}
        >
          <Question text={turn.question ?? ''} />
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

function LiveAnswer({ turn }: { turn: TurnState }) {
  return (
    <div className="turn-answer">
      {turn.text ? (
        <AnswerText text={turn.text} isLive />
      ) : (
        <span className="shimmer">
          {turn.graph === null ? 'Looking through the graph' : 'Writing the answer'}
        </span>
      )}
      <Sources citations={turn.citations} />
    </div>
  );
}

interface TurnEntryProps {
  turn: ConversationTurn;
  isActive: boolean;
  live: ReactNode;
  onSelect: (id: number) => void;
}

/** Memoised, so that a long conversation does not re-render for every token of its last answer. */
const TurnEntry = memo(function TurnEntry({ turn, isActive, live, onSelect }: TurnEntryProps) {
  const { question, answer } = turn;
  const canSelect = answer !== null && hasGraph(answer);
  const classes = ['turn', isActive && 'is-active', canSelect && 'can-select'];
  return (
    <article
      className={classes.filter(Boolean).join(' ')}
      onClick={canSelect ? () => onSelect(answer.id) : undefined}
    >
      {isActive && (
        <motion.span layoutId="active-turn" className="turn-marker" transition={SNAPPY} />
      )}
      {question && <Question text={question.content} />}
      {answer && (
        <div className="turn-answer">
          <AnswerText text={answer.content} />
          <Sources citations={answer.metadata?.citations ?? []} />
        </div>
      )}
      {live}
    </article>
  );
});

function Question({ text }: { text: string }) {
  const isLong = text.length > LONG_QUESTION_CHARS;
  return <h2 className={isLong ? 'turn-question is-long' : 'turn-question'}>{text}</h2>;
}
