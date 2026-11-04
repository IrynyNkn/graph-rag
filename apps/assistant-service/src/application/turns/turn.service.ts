import type { MessageMetadata, QueryRoute, TurnEvent } from '@graph-rag/contracts';
import { errorMessage } from '@graph-rag/nest-common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConversationsService } from '../conversations/conversations.service.js';
import { HistoryLoader } from '../conversations/history-loader.js';
import { QueryAnalyzer, type QueryAnalysis } from '../query/analysis/query-analyzer.js';
import {
  ANSWER_STRATEGIES,
  type AnswerStrategy,
  type AnswerEvent,
} from '../query/answering/answer-strategy.js';

@Injectable()
export class TurnService {
  private readonly logger = new Logger(TurnService.name);

  constructor(
    private readonly conversations: ConversationsService,
    private readonly history: HistoryLoader,
    private readonly analyzer: QueryAnalyzer,
    @Inject(ANSWER_STRATEGIES) private readonly strategies: AnswerStrategy[],
  ) {}

  /** Checks the conversation first, so the caller can still answer with an HTTP status. */
  async start(conversationId: string, question: string): Promise<AsyncGenerator<TurnEvent>> {
    await this.conversations.ensureExists(conversationId);
    return this.run(conversationId, question);
  }

  private async *run(conversationId: string, question: string): AsyncGenerator<TurnEvent> {
    try {
      yield* this.answer(conversationId, question);
    } catch (error) {
      this.logger.error(`Turn in ${conversationId} failed: ${errorMessage(error)}`);
      yield { type: 'error', message: errorMessage(error) };
    }
  }

  private async *answer(conversationId: string, question: string): AsyncGenerator<TurnEvent> {
    const userMessage = await this.conversations.appendUserMessage(conversationId, question);
    const history = await this.history.load(conversationId, userMessage.id);
    const analysis = await this.analyzer.analyze(question, history);
    yield { type: 'analysis', ...analysis };

    let content = '';
    const metadata = initialMetadata(analysis);
    const answer = this.strategyFor(analysis.route).answer({
      question: analysis.standaloneQuestion,
      history,
    });
    for await (const event of answer) {
      content += event.type === 'token' ? event.text : '';
      recordInMetadata(metadata, event);
      yield event;
    }
    const message = await this.conversations.appendAssistantMessage(
      conversationId,
      content,
      metadata,
    );
    yield { type: 'done', message };
  }

  private strategyFor(route: QueryRoute): AnswerStrategy {
    const strategy = this.strategies.find((candidate) => candidate.supports(route));
    if (strategy === undefined) {
      throw new Error(`No answer strategy supports the route "${route}"`);
    }
    return strategy;
  }
}

function initialMetadata({ route, standaloneQuestion }: QueryAnalysis): MessageMetadata {
  return { route, standaloneQuestion, graph: null, citations: [] };
}

/** The snapshot keeps an old answer and its graph readable after a document is deleted. */
function recordInMetadata(metadata: MessageMetadata, event: AnswerEvent): void {
  if (event.type === 'graph') {
    metadata.graph = event.graph;
  } else if (event.type === 'citations') {
    metadata.citations = event.citations;
  }
}
