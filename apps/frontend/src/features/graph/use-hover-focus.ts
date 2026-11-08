import { useCallback, useEffect, useRef, useState } from 'react';
import type { GraphFocus } from './graph-focus';

// Long enough to cross the gap between two chips, so that the card moves instead of blinking.
const LEAVE_DELAY_MS = 110;

export function useHoverFocus() {
  const [focus, setFocus] = useState<GraphFocus | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const enter = useCallback((next: GraphFocus) => {
    window.clearTimeout(timer.current);
    setFocus(next);
  }, []);

  const leave = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFocus(null), LEAVE_DELAY_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { focus, enter, leave };
}
