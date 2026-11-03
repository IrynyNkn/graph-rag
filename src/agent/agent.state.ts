import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { Subgraph } from '../graph/graph.types.js';

/**
 * Extends LangGraph's built-in MessagesAnnotation (message history, with its
 * own append/replace-by-id reducer — see the langgraph-local-test spike)
 * with one more accumulator: every Subgraph the local_retrieve tool returns,
 * across however many times the agent calls it in a single turn.
 *
 * QueryService.query() pre-Stage-4 only ever made one retrieval call per
 * question, so one Subgraph was the whole answer's evidence. An agent that
 * decomposes a question into N tool calls (Module 5's "compare X and Y")
 * produces N Subgraphs — the explainability panel needs all of them, not
 * just the last.
 *
 * The reducer here is a plain list-append, deliberately not a merge —
 * deduplicating nodes/edges across calls is a separate concern
 * (mergeSubgraphs, graph/merge-subgraphs.ts), run once after the graph
 * finishes, not repeated on every intermediate step.
 */
export const AgentStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  subgraphs: Annotation<Subgraph[]>({
    reducer: (existing, update) => existing.concat(update),
    default: () => [],
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;
