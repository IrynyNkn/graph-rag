import { useCallback, useRef, useState } from 'react';

/** Starts a question about a name, or adds the name to the question being written. */
export function addNameToDraft(draft: string, name: string): string {
  const written = draft.trimEnd();
  return written === '' ? `Tell me about ${name}` : `${written} ${name}`;
}

/** What is written in the composer, which the graph can add to. */
export function useDraft() {
  const [draft, setDraft] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);

  const addName = useCallback((name: string) => {
    setDraft((current) => addNameToDraft(current, name));
    field.current?.focus();
  }, []);

  return { draft, setDraft, field, addName };
}
