import type { QueryRoute } from '@graph-rag/contracts';
import { ChatModel, type ChatMessage } from '@graph-rag/inference';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config.js';
import { Retriever } from '../retrieval/retriever.js';
import { buildKnowledgeMessages, buildNoKnowledgeMessages } from './answer.prompt.js';
import { AnswerStrategy, type AnswerEvent, type AnswerRequest } from './answer-strategy.js';
import { ContextBuilder, type AnswerContext } from './context-builder.js';
import { toRetrievedGraph } from './retrieved-graph.js';

@Injectable()
export class KnowledgeBaseAnswerStrategy extends AnswerStrategy {
  constructor(
    private readonly retriever: Retriever,
    private readonly contextBuilder: ContextBuilder,
    private readonly chat: ChatModel,
    private readonly config: AppConfig,
  ) {
    super();
  }

  supports(route: QueryRoute): boolean {
    return route === 'knowledge_base';
  }

  async *answer({ question, history }: AnswerRequest): AsyncIterable<AnswerEvent> {
    const retrieval = await this.retriever.retrieve(question);
    yield { type: 'graph', graph: toRetrievedGraph(retrieval) };

    const context = await this.contextBuilder.build(retrieval);
    // Before the answer, so that an answer stopped halfway still has its sources.
    yield { type: 'citations', citations: context.chunks };
    const messages = isEmpty(context)
      ? buildNoKnowledgeMessages(history, question)
      : buildKnowledgeMessages(context, history, question);
    for await (const text of this.stream(messages)) {
      yield { type: 'token', text };
    }
  }

  private stream(messages: ChatMessage[]): AsyncIterable<string> {
    const { temperature, maxOutputTokens } = this.config.answer;
    return this.chat.stream({ messages, temperature, maxOutputTokens });
  }
}

function isEmpty({ paths, descriptions, chunks }: AnswerContext): boolean {
  return paths.length === 0 && descriptions.length === 0 && chunks.length === 0;
}
