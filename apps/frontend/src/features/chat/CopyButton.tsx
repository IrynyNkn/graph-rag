import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from '../../app/icons';

const LABELS = { idle: 'Copy', copied: 'Copied', failed: 'Could not copy' };
const LABEL_RESET_MS = 1600;

/** Copies the text as it was written, Markdown included. */
export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<keyof typeof LABELS>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      // The browser refuses outside a secure page or without permission, and the label says so.
      setState('failed');
    }
    timer.current = window.setTimeout(() => setState('idle'), LABEL_RESET_MS);
  };

  return (
    <button type="button" className="tool-button" onClick={() => void copy()}>
      {state === 'copied' ? <CheckIcon /> : <CopyIcon />}
      {LABELS[state]}
    </button>
  );
}
