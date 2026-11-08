import type { RetrievedGraph } from '@graph-rag/contracts';
import { useState } from 'react';

/** While the next conversation loads, its graph is unknown, so the last one stays to morph into it. */
export function useHeldGraph(graph: RetrievedGraph | null, isLoading: boolean) {
  const [held, setHeld] = useState(graph);
  if (!isLoading && held !== graph) {
    setHeld(graph);
  }
  return isLoading ? held : graph;
}
