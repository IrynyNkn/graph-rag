import { useState, type ReactNode } from 'react';

interface ConfirmButtonProps {
  label: string;
  children: ReactNode;
  onConfirm: () => void;
}

/** Deleting cannot be undone and can throw away minutes of indexing, so it takes a second click. */
export function ConfirmButton({ label, children, onConfirm }: ConfirmButtonProps) {
  const [isAsking, setIsAsking] = useState(false);
  return (
    <button
      type="button"
      className={isAsking ? 'confirm-button is-asking' : 'confirm-button'}
      aria-label={isAsking ? `Really ${label.toLowerCase()}?` : label}
      onClick={() => (isAsking ? onConfirm() : setIsAsking(true))}
      onMouseLeave={() => setIsAsking(false)}
      onBlur={() => setIsAsking(false)}
    >
      {isAsking ? 'Sure?' : children}
    </button>
  );
}
