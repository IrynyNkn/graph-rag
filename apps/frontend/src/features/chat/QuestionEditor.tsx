import { useState, type FormEvent, type KeyboardEvent } from 'react';

interface QuestionEditorProps {
  initial: string;
  /** What asking again throws away, or empty when nothing is lost. */
  loss: string;
  isLocked: boolean;
  onAsk: (question: string) => void;
  onCancel: () => void;
}

export function QuestionEditor({ initial, loss, isLocked, onAsk, onCancel }: QuestionEditorProps) {
  const [text, setText] = useState(initial);
  const question = text.trim();
  const canAsk = question.length > 0 && !isLocked;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (canAsk) {
      onAsk(question);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <form
      className="question-editor"
      onSubmit={submit}
      onClick={(event) => event.stopPropagation()}
    >
      <textarea
        // Editing starts from a click on Edit, which means typing comes next.
        // oxlint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={text}
        aria-label="Question"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <footer>
        <span className="question-editor-loss">{loss}</span>
        <button type="button" className="tool-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="tool-button is-primary" disabled={!canAsk}>
          Ask again
        </button>
      </footer>
    </form>
  );
}
