import { useState, type FormEvent, type KeyboardEvent } from 'react';

interface ComposerProps {
  disabled: boolean;
  onSend: (question: string) => void;
}

export function Composer({ disabled, onSend }: ComposerProps) {
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
    <form className="composer" onSubmit={handleSubmit}>
      <textarea
        value={text}
        rows={2}
        placeholder="Ask about your documents"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button type="submit" className="button button-primary" disabled={!canSend}>
        Send
      </button>
    </form>
  );
}
