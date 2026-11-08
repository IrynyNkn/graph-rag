import type {
  MessageMetadata,
  QueryRoute,
  SendMessageRequest,
  TurnEvent,
} from '@graph-rag/contracts';
import { errorMessage } from '@graph-rag/nest-common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config.js';
import type { ConversationHistory } from '../conversations/conversation-history.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { HistoryLoader } from '../conversations/history-loader.js';
import { QueryAnalyzer, type QueryAnalysis } from '../query/analysis/query-analyzer.js';
import {
  ANSWER_STRATEGIES,
  type AnswerStrategy,
  type AnswerEvent,
} from '../query/answering/answer-strategy.js';
import { TurnStopwatch } from './turn-stopwatch.js';

@Injectable()
export class TurnService {
  private readonly logger = new Logger(TurnService.name);
  /** Kept in memory, which works because the service runs as one instance. */
  private readonly running = new Map<string, AbortController>();

  constructor(
    private readonly conversations: ConversationsService,
    private readonly history: HistoryLoader,
    private readonly analyzer: QueryAnalyzer,
    @Inject(ANSWER_STRATEGIES) private readonly strategies: AnswerStrategy[],
    private readonly config: AppConfig,
  ) {}

  /**
   * Checks the conversation first, and rewinds it for a question asked again, so the caller can
   * still answer with an HTTP status.
   */
  async start(
    conversationId: string,
    { content, replacesFromMessageId }: SendMessageRequest,
  ): Promise<AsyncGenerator<TurnEvent>> {
    await this.conversations.ensureExists(conversationId);
    if (replacesFromMessageId !== undefined) {
      await this.conversations.rewind(conversationId, replacesFromMessageId);
    }
    return this.run(conversationId, content);
  }

  /**
   * Stops the running turn of a conversation at its next token. The turn keeps what it has
   * written so far and ends as usual, so the stream that asked for it gets its `done`.
   */
  stop(conversationId: string): void {
    this.running.get(conversationId)?.abort();
  }

  private async *run(conversationId: string, question: string): AsyncGenerator<TurnEvent> {
    const stopper = new AbortController();
    this.running.set(conversationId, stopper);
    try {
      yield* this.answer(conversationId, question, stopper.signal);
    } catch (error) {
      this.logger.error(`Turn in ${conversationId} failed: ${errorMessage(error)}`);
      yield { type: 'error', message: errorMessage(error) };
    } finally {
      if (this.running.get(conversationId) === stopper) {
        this.running.delete(conversationId);
      }
    }
  }

  private async *answer(
    conversationId: string,
    question: string,
    stopped: AbortSignal,
  ): AsyncGenerator<TurnEvent> {
    const stopwatch = new TurnStopwatch();
    const userMessage = await this.conversations.appendUserMessage(conversationId, question);
    const history = await this.history.load(conversationId, userMessage.id);
    const analysis = await this.analyzer.analyze(question, history);
    stopwatch.observe('analysis');
    yield { type: 'analysis', ...analysis };

    const { content, metadata } = yield* this.write(analysis, history, stopwatch, stopped);
    if (stopped.aborted && content.length === 0) {
      return;
    }
    const message = await this.conversations.appendAssistantMessage(conversationId, content, {
      ...metadata,
      timings: stopwatch.read(),
      stopped: stopped.aborted,
    });
    yield { type: 'done', message };
  }

  private async *write(
    analysis: QueryAnalysis,
    history: ConversationHistory,
    stopwatch: TurnStopwatch,
    stopped: AbortSignal,
  ): AsyncGenerator<AnswerEvent, { content: string; metadata: MessageMetadata }> {
    let content = '';
    const metadata = this.initialMetadata(analysis);
    const answer = this.strategyFor(analysis.route).answer({
      question: analysis.standaloneQuestion,
      history,
    });
    for await (const event of answer) {
      // Leaving the loop closes the strategy, and with it the request to the model.
      if (stopped.aborted) {
        break;
      }
      stopwatch.observe(event.type);
      content += event.type === 'token' ? event.text : '';
      recordInMetadata(metadata, event);
      yield event;
    }
    return { content, metadata };
  }

  private initialMetadata({ route, standaloneQuestion }: QueryAnalysis): MessageMetadata {
    const { chat, embedding } = this.config.inference;
    return {
      route,
      standaloneQuestion,
      graph: null,
      citations: [],
      models: { chat: chat.model, embedding: embedding.model },
    };
  }

  private strategyFor(route: QueryRoute): AnswerStrategy {
    const strategy = this.strategies.find((candidate) => candidate.supports(route));
    if (strategy === undefined) {
      throw new Error(`No answer strategy supports the route "${route}"`);
    }
    return strategy;
  }
}

/** The snapshot keeps an old answer and its graph readable after a document is deleted. */
function recordInMetadata(metadata: MessageMetadata, event: AnswerEvent): void {
  if (event.type === 'graph') {
    metadata.graph = event.graph;
  } else if (event.type === 'citations') {
    metadata.citations = event.citations;
  }
}
