import { useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/** Follows the system until the user picks a theme, and remembers that choice. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    crossfade(() => {
      document.documentElement.dataset.theme = next;
    });
  };

  return { theme, toggleTheme };
}

export function applyStoredTheme(): void {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.dataset.theme = stored;
  }
}

function readInitialTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function crossfade(change: () => void): void {
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(change);
  } else {
    change();
  }
}
