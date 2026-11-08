import { motion } from 'motion/react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { StopIcon } from '../../app/icons';
import { SMOOTH } from '../../app/motion';
import './Composer.css';

interface ComposerProps {
  /** Under the invitation in an empty chat, and at the bottom once there is a conversation. */
  isCentered: boolean;
  /** One turn runs at a time, and it may be running in another conversation. */
  isLocked: boolean;
  /** An answer is being written in this conversation, which is the one this can stop. */
  isAnswering: boolean;
  isStopping: boolean;
  onSend: (question: string) => void;
  onStop: () => void;
}

export function Composer({
  isCentered,
  isLocked,
  isAnswering,
  isStopping,
  onSend,
  onStop,
}: ComposerProps) {
  const [text, setText] = useState('');
  const question = text.trim();
  const canSend = !isLocked && question.length > 0;

  const submit = () => {
    if (canSend) {
      onSend(question);
      setText('');
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape' && isAnswering) {
      onStop();
    }
  };

  return (
    <motion.form
      layout="position"
      layoutDependency={isCentered}
      transition={SMOOTH}
      className="composer"
      onSubmit={handleSubmit}
    >
      <div className="composer-box">
        <textarea
          value={text}
          rows={2}
          placeholder="Ask about your documents"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {isAnswering ? (
          <button
            type="button"
            className="composer-send is-stop"
            disabled={isStopping}
            onClick={onStop}
          >
            {isStopping ? <i className="composer-spinner" aria-hidden="true" /> : <StopIcon />}
            {isStopping ? 'Stopping' : 'Stop'}
          </button>
        ) : (
          <button type="submit" className="composer-send" aria-label="Ask" disabled={!canSend}>
            Ask
            <kbd>↵</kbd>
          </button>
        )}
      </div>
    </motion.form>
  );
}
