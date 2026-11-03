import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOllama } from '@langchain/ollama';
import { tool } from '@langchain/core/tools';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { StateGraph, START, END } from '@langchain/langgraph';
import { z } from 'zod';
import { parseJsonSafe } from '../common/parse-json.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { GraphService } from '../graph/graph.service.js';
import { mergeSubgraphs } from '../graph/merge-subgraphs.js';
import type { Subgraph } from '../graph/graph.types.js';
import { LlmService } from '../llm/llm.service.js';
import { buildEntityExtractionPrompt } from '../query/query.prompts.js';
import { buildSystemPrompt } from './agent.prompts.js';
import { AgentStateAnnotation, type AgentState } from './agent.state.js';

const entitySchema = z.object({ entities: z.array(z.string().min(1)) });

/** A single retrieval call's result, before merging: text for the LLM to
 *  read, and the structured Subgraph for the explainability accumulator. */
interface RetrievalResult {
  factsText: string;
  subgraph: Subgraph;
}

export interface AgentAnswer {
  answer: string;
  subgraph: Subgraph;
}

/**
 * Stage 4: the agentic query path. Replaces QueryService's old fixed
 * sequence (extract phrases -> seed nodes -> PPR -> getNeighborhood ->
 * generate) with a LangGraph loop: the model decides whether to call
 * local_retrieve (0, 1 or N times, formulating its own query each time) or
 * give a final answer. That whole old sequence didn't disappear — it's now
 * the body of local_retrieve (see retrieveForAgent below), reached through
 * the "tools" node instead of being run unconditionally once per question.
 *
 * Builds the graph once, in the constructor, and reuses the compiled graph
 * across requests (cheap to compile, no reason to rebuild it per call) —
 * each .invoke() gets its own independent state, so this is safe under
 * concurrent requests despite the graph object being shared.
 *
 * Tool dispatch is hand-written (executeTools below), not LangGraph's
 * prebuilt ToolNode: ToolNode only knows how to produce a ToolMessage's text
 * content from a tool's return value, with no built-in path for also
 * routing structured data (our Subgraph) into a custom state field like
 * `subgraphs`. Routing that requires either an unverified LangChain feature
 * ("content_and_artifact" tool responses) or a hand-written node; writing
 * the node is the more transparent, fully-understood option, and with only
 * one tool right now the dispatch logic is a few lines, not an abstraction
 * worth adopting sight-unseen.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly boundModel;
  private readonly localRetrieveTool;
  private readonly compiledGraph;

  constructor(
    private readonly graph: GraphService,
    private readonly embedding: EmbeddingService,
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {
    const model = new ChatOllama({
      baseUrl: config.getOrThrow<string>('ollama.baseUrl'),
      model: config.getOrThrow<string>('ollama.model'),
    });

    const localRetrieveSchema = z.object({
      query: z
        .string()
        .describe('A focused natural-language query about one subject.'),
    });

    // Typed as `unknown`, not `z.infer<typeof localRetrieveSchema>`, and
    // parsed with that schema inside the body — not stylistic. Our
    // top-level zod is v4; @langchain/core@0.3.x's own tool() overloads
    // are written against zod v3's *types* (confirmed live: a v4 schema
    // round-trips correctly through bindTools()+Ollama at runtime, but TS
    // can't statically match a v4 schema's type to the v3-shaped overload,
    // so it falls back to the `unknown`-typed one). Parsing here instead
    // of trusting the destructure also means a malformed tool call from
    // the model gets a real validation error, not a silent `undefined`.
    //
    // Returns the full RetrievalResult ({ factsText, subgraph }), not just
    // text — this function is the *real* execution path (see executeTools:
    // it calls this.localRetrieveTool.invoke(call.args), not
    // retrieveForAgent directly), so it needs to hand back everything the
    // caller needs, not just what a ToolMessage's content would show the
    // model. Verified separately that .invoke() with plain args (not a full
    // ToolCall) returns this object untouched — passing a full ToolCall
    // instead makes LangChain auto-wrap the return into a ToolMessage whose
    // content is `JSON.stringify(wholeObject)`, which would leak the raw
    // Subgraph JSON into what the model reads as "facts".
    this.localRetrieveTool = tool(
      async (input: unknown) => {
        const { query } = localRetrieveSchema.parse(input);
        return this.retrieveForAgent(query);
      },
      {
        name: 'local_retrieve',
        description:
          'Searches the knowledge graph for facts relevant to a focused query about ONE subject. Call it once per distinct subject a question asks about — never once for a question covering several subjects.',
        schema: localRetrieveSchema,
      },
    );

    this.boundModel = model.bindTools([this.localRetrieveTool]);

    this.compiledGraph = new StateGraph(AgentStateAnnotation)
      .addNode('agent', this.callModel.bind(this))
      .addNode('tools', this.executeTools.bind(this))
      .addEdge(START, 'agent')
      .addConditionalEdges('agent', this.shouldContinue.bind(this), {
        tools: 'tools',
        [END]: END,
      })
      .addEdge('tools', 'agent')
      .compile();
  }

  async answer(question: string): Promise<AgentAnswer> {
    const result = await this.compiledGraph.invoke(
      {
        messages: [
          new SystemMessage(buildSystemPrompt()),
          new HumanMessage(question),
        ],
        subgraphs: [],
      },
      // Loop safety (Module 5's "max_steps"): caps how many agent<->tools
      // round-trips one question can trigger before LangGraph aborts with a
      // GraphRecursionError, instead of looping indefinitely on a model that
      // never decides to stop.
      { recursionLimit: 10 },
    );

    const lastMessage = result.messages[result.messages.length - 1];
    return {
      answer: String(lastMessage.content).trim(),
      subgraph: mergeSubgraphs(result.subgraphs),
    };
  }

  private async callModel(state: AgentState): Promise<Partial<AgentState>> {
    const response = await this.boundModel.invoke(state.messages);
    return { messages: [response] };
  }

  private shouldContinue(state: AgentState): 'tools' | typeof END {
    const last = state.messages[state.messages.length - 1] as AIMessage;
    return last.tool_calls && last.tool_calls.length > 0 ? 'tools' : END;
  }

  private async executeTools(state: AgentState): Promise<Partial<AgentState>> {
    const last = state.messages[state.messages.length - 1] as AIMessage;
    const toolMessages: ToolMessage[] = [];
    const newSubgraphs: Subgraph[] = [];

    for (const call of last.tool_calls ?? []) {
      if (call.name !== 'local_retrieve') {
        // Defensive, not expected with one bound tool — but a model can in
        // principle hallucinate a tool name, and that must not crash the loop.
        toolMessages.push(
          new ToolMessage({
            content: `Unknown tool "${call.name}".`,
            tool_call_id: call.id ?? '',
            name: call.name,
          }),
        );
        continue;
      }

      // call.args (plain { query: ... }), not `call` itself — invoking with
      // the full ToolCall object makes LangChain auto-wrap the return into a
      // ToolMessage whose content is the JSON-stringified whole object
      // (verified directly); we want the raw { factsText, subgraph } back,
      // unwrapped, so we can route each half differently.
      const { factsText, subgraph } = (await this.localRetrieveTool.invoke(
        call.args,
      )) as RetrievalResult;
      toolMessages.push(
        new ToolMessage({
          content: factsText,
          tool_call_id: call.id ?? '',
          name: call.name,
        }),
      );
      newSubgraphs.push(subgraph);
    }

    return { messages: toolMessages, subgraphs: newSubgraphs };
  }

  /**
   * The Stage 0-2 retrieval pipeline, unchanged in substance from the old
   * QueryService.query() — only the final "generate answer" step is gone
   * (the agent loop owns that now). Called once per local_retrieve
   * invocation, with whatever query string the model chose for this turn,
   * not necessarily the user's original question verbatim.
   */
  private async retrieveForAgent(query: string): Promise<RetrievalResult> {
    const rawEntities = await this.llm.generateText(
      buildEntityExtractionPrompt(query),
      { json: true },
    );

    const parsed = entitySchema.safeParse(parseJsonSafe(rawEntities));
    if (!parsed.success) {
      this.logger.warn(
        `Agent retrieval: entity extraction rejected: ${parsed.error.message}`,
      );
    }
    const phrases = parsed.success ? parsed.data.entities : [];

    const threshold = this.config.getOrThrow<number>(
      'embedding.similarityThreshold',
    );
    const bestScoreByName = new Map<string, number>();
    for (const phrase of phrases) {
      const vector = await this.embedding.embedQuery(phrase);
      const matches = await this.graph.findSeedNodesByVector(vector, threshold);
      for (const match of matches) {
        const best = bestScoreByName.get(match.name);
        if (best === undefined || match.score > best) {
          bestScoreByName.set(match.name, match.score);
        }
      }
    }
    const seedNames = [...bestScoreByName.keys()];

    const topN = this.config.getOrThrow<number>('ppr.topN');
    const ranked = await this.graph.personalizedPageRank(seedNames, topN);
    const subgraph = await this.graph.getNeighborhood(ranked.map((n) => n.name));

    const factsText =
      subgraph.edges
        .map((e) => `(${e.source}) -[${e.relation}]-> (${e.target})`)
        .join('\n') || 'No facts were found in the graph for this query.';

    this.logger.debug(
      `local_retrieve("${query}") -> seeds=${JSON.stringify(seedNames)} facts=${subgraph.edges.length}`,
    );

    return { factsText, subgraph };
  }
}
