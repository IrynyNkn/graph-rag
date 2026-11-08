import { motion } from 'motion/react';
import { memo, type ReactNode } from 'react';
import { ConfirmButton } from '../../app/ConfirmButton';
import { AgainIcon, PencilIcon, TrashIcon } from '../../app/icons';
import { SNAPPY } from '../../app/motion';
import { AnswerText } from './AnswerText';
import { QuestionEditor } from './QuestionEditor';
import { Sources } from './Sources';
import { describeLoss, hasGraph, type ConversationTurn } from './turns';
import './TurnEntry.css';

const LONG_QUESTION_CHARS = 140;

/** What the user can do to the questions already asked. */
export interface TurnActions {
  /** Nothing can be asked again while an answer is on its way. */
  isLocked: boolean;
  /** Asks in place of a question, which drops it and everything after it. */
  askAgain: (questionId: number, question: string) => void;
  /** Deletes a question and everything after it. */
  rewind: (questionId: number) => void;
}

interface TurnEntryProps {
  turn: ConversationTurn;
  isActive: boolean;
  isLast: boolean;
  laterTurns: number;
  isEditing: boolean;
  /** The answer being written for this turn's question. */
  live: ReactNode;
  actions: TurnActions;
  onSelect: (id: number) => void;
  onEdit: (questionId: number | null) => void;
}

/** Memoised, so that a long conversation does not re-render for every token of its last answer. */
export const TurnEntry = memo(function TurnEntry(props: TurnEntryProps) {
  const { turn, isActive, live, onSelect } = props;
  const { answer } = turn;
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
      <QuestionPart {...props} />
      <AnswerPart {...props} />
      {live}
    </article>
  );
});

function QuestionPart({ turn, laterTurns, isEditing, actions, onEdit }: TurnEntryProps) {
  const { question, answer } = turn;
  if (question === null) {
    return null;
  }
  if (isEditing) {
    return (
      <QuestionEditor
        initial={question.content}
        loss={describeLoss(laterTurns, answer !== null)}
        isLocked={actions.isLocked}
        onAsk={(text) => {
          onEdit(null);
          actions.askAgain(question.id, text);
        }}
        onCancel={() => onEdit(null)}
      />
    );
  }
  return (
    <header className="turn-head">
      <Question text={question.content} />
      {!actions.isLocked && (
        <div className="question-tools" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="tool-button"
            aria-label="Edit the question"
            onClick={() => onEdit(question.id)}
          >
            <PencilIcon />
          </button>
          <ConfirmButton
            label="Delete this question and everything after it"
            onConfirm={() => actions.rewind(question.id)}
          >
            <TrashIcon />
          </ConfirmButton>
        </div>
      )}
    </header>
  );
}

function AnswerPart({ turn, isLast, isEditing, live, actions }: TurnEntryProps) {
  const { question, answer } = turn;
  const canAskAgain = isLast && !isEditing && question !== null && !actions.isLocked;
  const askAgain = canAskAgain && (
    <AskAgainButton onAsk={() => actions.askAgain(question.id, question.content)} />
  );
  if (answer === null) {
    return canAskAgain && !live ? <p className="turn-missing">No answer. {askAgain}</p> : null;
  }
  const stopped = answer.metadata?.stopped === true && (
    <span className="turn-stopped">Stopped</span>
  );
  return (
    <div className="turn-answer">
      <AnswerText text={answer.content} />
      <Sources
        citations={answer.metadata?.citations ?? []}
        tools={
          (stopped || askAgain) && (
            <>
              {stopped}
              {askAgain}
            </>
          )
        }
      />
    </div>
  );
}

function AskAgainButton({ onAsk }: { onAsk: () => void }) {
  return (
    <button
      type="button"
      className="tool-button"
      onClick={(event) => {
        event.stopPropagation();
        onAsk();
      }}
    >
      <AgainIcon />
      Ask again
    </button>
  );
}

export function Question({ text }: { text: string }) {
  const isLong = text.length > LONG_QUESTION_CHARS;
  return <h2 className={isLong ? 'turn-question is-long' : 'turn-question'}>{text}</h2>;
}
