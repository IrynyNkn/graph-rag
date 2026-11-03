import { Injectable } from '@nestjs/common';
import { AgentService } from '../agent/agent.service.js';
import type { Subgraph } from '../graph/graph.types.js';

export interface QueryResult {
  answer: string;
  /** Returned so the client can render the exact subgraph the answer used. */
  subgraph: Subgraph;
}

/**
 * Stage 4: thin facade. Everything that used to live here directly (extract
 * phrases, find seed nodes, PPR, getNeighborhood, generate the answer) moved
 * into AgentService.retrieveForAgent/answer — that fixed sequence is now
 * the body of the local_retrieve tool, run when and as many times as the
 * agent decides, not once unconditionally per question. This class exists
 * only so the controller's dependency and the HTTP contract don't change.
 */
@Injectable()
export class QueryService {
  constructor(private readonly agent: AgentService) {}

  async query(question: string): Promise<QueryResult> {
    return this.agent.answer(question);
  }
}
