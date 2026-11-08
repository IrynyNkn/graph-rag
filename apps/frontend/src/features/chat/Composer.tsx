import { motion } from 'motion/react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { SMOOTH } from '../../app/motion';
import './Composer.css';

interface ComposerProps {
  /** Under the invitation in an empty chat, and at the bottom once there is a conversation. */
  isCentered: boolean;
  disabled: boolean;
  onSend: (question: string) => void;
}

export function Composer({ isCentered, disabled, onSend }: ComposerProps) {
  const [text, setText] = useState('');
  const question = text.trim();
  const canSend = !disabled && question.length > 0;

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
        <button
          type="submit"
          className={disabled ? 'composer-send is-busy' : 'composer-send'}
          disabled={!canSend}
        >
          Ask
          {disabled ? <i className="composer-spinner" aria-hidden="true" /> : <kbd>↵</kbd>}
        </button>
      </div>
    </motion.form>
  );
}
