# Architecture

This describes the system as it is built. The structure is not a commitment: when the code shows a better shape, change it and update this file. The last sections say what has actually been tested and what is known to be missing.

## Services

| Service             | Responsibility                                                                       | Talks to                                    |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------- |
| `frontend`          | React UI, served by nginx, which also proxies to both APIs so there is no CORS       | `indexing-service`, `assistant-service`     |
| `indexing-service`  | Accepts files, lists documents and their status, requests deletion, retries failures | Postgres, file volume, RabbitMQ             |
| `indexing-worker`   | Builds the knowledge graph from documents and removes documents from it. No HTTP     | RabbitMQ, file volume, Postgres, Neo4j, LLM |
| `assistant-service` | Conversations and answers, streamed over SSE                                         | Postgres, Neo4j, LLM                        |

Compose runs these plus Postgres, Neo4j and RabbitMQ. Named volumes hold the data of each store and the uploaded files. Memory limits are modest because the target is a MacBook Air: the containers may use 3.6 GB in total, of which Neo4j may use 1.8 GB with a 1 GB heap and a 256 MB page cache. At idle they used about 1.5 GB, 1.1 GB of it Neo4j. A model running in Ollama comes on top of that: 3.3 GB for `qwen3.5:4b` and 0.6 GB for `qwen3-embedding:0.6b`.

## Repository layout

```
.
├── apps/                                 each also has package.json and tsconfig.json
│   ├── indexing-service/
│   │   ├── src/
│   │   │   ├── presentation/             REST
│   │   │   ├── application/              upload, list, delete, retry
│   │   │   ├── infrastructure/
│   │   │   │   └── repositories/         documents
│   │   │   ├── app.module.ts
│   │   │   ├── config.ts
│   │   │   └── main.ts
│   │   └── test/integration/
│   ├── indexing-worker/
│   │   ├── src/
│   │   │   ├── presentation/             queue consumer
│   │   │   ├── application/
│   │   │   │   ├── indexing/             process: add a document
│   │   │   │   │   ├── parsing/          parser port, selection by file type, block model
│   │   │   │   │   ├── chunking/         chunking strategies and their selection
│   │   │   │   │   ├── extraction/       entities and relations from a chunk, prompt
│   │   │   │   │   └── resolution/       matching against known entities, prompt
│   │   │   │   ├── removal/              process: remove a document
│   │   │   │   └── knowledge/            shared: refresh descriptions and embeddings
│   │   │   ├── infrastructure/
│   │   │   │   ├── parsers/              PDF, MD, TXT
│   │   │   │   └── repositories/         document status, chunks, entities, removal, queries
│   │   │   ├── app.module.ts
│   │   │   ├── config.ts
│   │   │   └── main.ts
│   │   └── test/integration/
│   ├── assistant-service/
│   │   ├── src/
│   │   │   ├── presentation/             conversations REST, SSE stream
│   │   │   ├── application/
│   │   │   │   ├── conversations/        conversations, messages, history folding, prompt
│   │   │   │   ├── turns/                one turn of the dialogue
│   │   │   │   └── query/
│   │   │   │       ├── analysis/         is retrieval needed, reformulation, prompt
│   │   │   │       ├── retrieval/        QASA, entities from the question, prompt
│   │   │   │       └── answering/        answer strategies, context, UI graph, prompts
│   │   │   ├── infrastructure/
│   │   │   │   └── repositories/         conversations, QASA query, source chunks
│   │   │   ├── app.module.ts
│   │   │   ├── config.ts
│   │   │   └── main.ts
│   │   └── test/integration/
│   └── frontend/
│       ├── src/
│       │   ├── app/                      routes, providers
│       │   ├── api/                      HTTP and SSE client
│       │   └── features/                 documents, chat, graph
│       ├── Dockerfile
│       └── nginx.conf
├── packages/                             shared libraries, never run on their own
│   ├── contracts/                        zod schemas: queue, HTTP, turn events; entity names
│   ├── inference/                        ChatModel, Embedder; Ollama and OpenAI-compatible adapters
│   ├── graph-store/                      graph connection and schema
│   ├── relational-store/                 connection, tables, migrations
│   ├── file-store/                       storage of the original files
│   ├── job-queue/                        job queue
│   ├── nest-common/                      env parsing, base errors, shared Nest pieces
│   └── testing/                          dev only: fakes and containers for tests
├── docs/
├── test-data/                            Meridian Dynamics corpus for manual checks
├── compose.yaml
├── Dockerfile                            one for all backend services, the service is a build argument
└── root configs                          package.json, pnpm-workspace.yaml, tsconfig.base.json,
                                          tsconfig.json, vitest.config.ts, oxlint.json, .prettierrc,
                                          .gitattributes, .dockerignore, .gitignore, .env.example
```

Dependencies (`contracts` is used by all, `nest-common` by all backend services):

```
indexing-service  -> relational-store, file-store, job-queue
indexing-worker   -> relational-store, file-store, job-queue, graph-store, inference
assistant-service -> relational-store, graph-store, inference
```

Code that only one service needs stays in that service. All tables sit in `relational-store` on purpose: there is one database, and two migration sets would add machinery for no gain.

`oxlint.json` enforces the layers: `application` cannot import `infrastructure`, `presentation`, drivers or stores, and `presentation` cannot import `infrastructure`.

## Stack

| Concern         | Choice                                                            | Why                                                                                      |
| --------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Backend         | NestJS, TypeScript, ESM                                           | Class-based, constructor DI                                                              |
| Monorepo        | pnpm workspaces                                                   | A service cannot import a package it did not declare                                     |
| Postgres access | Drizzle                                                           | Typed queries, no decorators on models, SQL migrations                                   |
| Queue client    | `amqplib` with `amqp-connection-manager`                          | Control over acks and prefetch, which Nest's RMQ transport hides, plus reconnection      |
| LLM clients     | Official `ollama` and `openai` SDKs, inside adapters              | OpenRouter and ChatGPT share the OpenAI-compatible adapter                               |
| PDF             | `unpdf`                                                           | pdf.js without its optional native canvas                                                |
| Markdown        | `marked` lexer                                                    | Handles code fences and both heading styles, which a hand-written parser would get wrong |
| Frontend        | React, Vite, TanStack Query, React Router, `react-force-graph-2d` | Minimal design now, redesign later                                                       |

Dropped from the prototype: LangChain and LangGraph (the flow is fixed, there is no agent loop), GDS and Personalized PageRank (QASA replaces them).

Ports are abstract classes rather than TypeScript interfaces, so Nest resolves them by constructor type without injection tokens: `{ provide: ChatModel, useClass: OllamaChatModel }`. Strategies arrive as an injected list, and the first whose `supports()` returns true is used; there are no registry classes.

Each service has one `AppConfig`, built from validated env in `main.ts` and passed to `AppModule.forRoot(config)`, so integration tests can start the real module against their containers. It refuses to start when the prompt budgets do not fit `CHAT_CONTEXT_WINDOW`.

## Inference

```ts
abstract class ChatModel {
  abstract complete(request: ChatRequest): Promise<string>;
  abstract completeStructured<T>(request: ChatRequest, schema: ZodType<T>): Promise<T>;
  abstract stream(request: ChatRequest): AsyncIterable<string>;
}
abstract class Embedder {
  abstract embedDocuments(texts: string[]): Promise<number[][]>;
  abstract embedQuery(text: string): Promise<number[]>;
}
```

- Adapters: `OllamaChatModel`, `OpenAiCompatibleChatModel`, `OllamaEmbedder`, `OpenAiCompatibleEmbedder`. A chat adapter extends `StreamingChatModel` and implements only `generate`. Adding a provider takes a new adapter, a line in `InferenceModule`, a value in `providerSchema` and a config value.
- Everything streams, even when the caller wants the whole text: a slow local model would otherwise hit fetch's five-minute wait for response headers.
- Chat and embedding providers are configured separately. Embeddings may stay local while chat goes through OpenRouter. Each service sets its own model, so extraction and answers can use different ones.
- Decorators: `RetryingChatModel` and `RetryingEmbedder` retry with backoff, and a stream only before its first token. `DimensionCheckingEmbedder` fails loudly on a vector the index would silently skip.
- Errors: `ModelUnavailableError` (retried), `InvalidModelOutputError` (retried, then the caller decides), `ModelRequestError` (bad key or unknown model, never retried).
- The Ollama adapter passes `num_ctx`, `think: false` and `format: <JSON schema>`. Zod v4's `z.toJSONSchema()` produces the schema.
- Embedding task prefixes are model-specific, so they are config.
- `embedDocuments` is batch-first. On the Windows GPU a batch of 32 cost 79 ms per text and single calls about 2 s each, so never embed one by one in a loop.

## Postgres

- `documents`: id, name, content hash (unique), type, size, status, chunksTotal, chunksDone, chunksFailed, error, timestamps. Status is `queued`, `indexing`, `indexed`, `failed` or `deleting`. Transitions in the worker are compare-and-set, so a late `indexed` cannot overwrite `deleting`.
- `conversations`: id, title, summary, summarisedUpToMessageId, timestamps.
- `messages`: identity id, conversationId, role, content, metadata (JSONB: route, standalone question, retrieved graph, citations), createdAt. The snapshot keeps old answers and their graph readable after a document is deleted.

`relational-store` applies migrations when a service starts, under an advisory lock. `graph-store` creates constraints and indexes the same way. There is no separate migration step, so a fresh environment and every integration test get a ready schema.

## Neo4j

```
(:Chunk {id, documentId, documentName, ordinal, text})-[:MENTIONS {description}]->(:Entity)
(:Entity {name, type, description, descriptionEmbedding, revision, refreshedRevision})
(:Entity)-[:RELATES_TO {relations: [...], chunkIds: [...]}]->(:Entity)
```

There is one `RELATES_TO` per ordered entity pair, as in QASA, so its algorithm ports unchanged, and `relations[i]` came from `chunkIds[i]`. Schema: unique `Entity.name`, unique `Chunk.id`, an index on `Chunk.documentId`, a vector index on `Entity.descriptionEmbedding`, a fulltext index on `Entity.name`. The vector dimension is checked at startup, and a mismatch stops the service.

`normalizeEntityName` in `contracts` is the identity of an entity: lowercase, collapsed whitespace, no leading article. Indexing writes through it and retrieval looks up through it.

### Porting QASA

Source: `qasa_rag/retrieval/qasa_retriever.py` and `_deduplicate_paths` in `retriever.py` from `github.com/kinfi4/qasa-graph-rag`. Defaults there: 3 steps, decay 0.7, threshold 0.01, top-K 30 paths and 30 entities, 5 vector seeds. Those are config here. The port is `qasa.query.ts`, which keeps all state in a single stateless query instead of QASA's temporary node properties, so concurrent questions cannot disturb each other. Other changes:

- `gds.similarity.cosine(a, b)` becomes `2 * vector.similarity.cosine(a, b) - 1`.
- Properties are renamed to this model (`descriptionEmbedding`).
- Paths also return each node's activation, type and description, and each edge returns `relations` and `chunkIds`. The UI needs these for weights and citations.
- `LIMIT` and `k` parameters go through `graphInt()`.

The QASA repo measured prompts of 4.5k to 14k tokens, so `ContextBuilder` fits the context into the budget, dropping the lowest weights first.

### Removing a document

Run in one transaction. `$chunkIds` is the list of the document's chunk IDs:

```cypher
MATCH (:Chunk {documentId: $documentId})-[:MENTIONS]->(:Entity)-[relation:RELATES_TO]-(:Entity)
WITH DISTINCT relation
WITH relation,
     [i IN range(0, size(relation.chunkIds) - 1) WHERE NOT relation.chunkIds[i] IN $chunkIds] AS keep
SET relation.relations = [i IN keep | relation.relations[i]],
    relation.chunkIds = [i IN keep | relation.chunkIds[i]]
WITH relation, keep
WHERE size(keep) = 0
DELETE relation;

MATCH (chunk:Chunk {documentId: $documentId})
OPTIONAL MATCH (chunk)-[:MENTIONS]->(e:Entity)
SET e.revision = e.revision + 1
WITH chunk
DETACH DELETE chunk;
```

The refresher then deletes orphans with a plain `DELETE`, not `DETACH DELETE`. If a concurrent job has just attached a mention, the delete fails and is retried rather than destroying it:

```cypher
MATCH (e:Entity)
WHERE e.revision <> e.refreshedRevision AND NOT EXISTS { (:Chunk)-[:MENTIONS]->(e) }
DELETE e;
```

## Indexing flow

1. `indexing-service`: validate type and emptiness, insert the row as `queued` (a unique content hash rejects duplicates), save the file, publish a job. If saving fails, the row goes. If publishing fails, the document is marked `failed`. There is no outbox; the Retry action covers this.
2. `indexing-worker` takes the job and moves the document to `indexing`, unless it is gone, `deleting` or already `indexed`.
3. Parse the file into `ParsedDocument`, a flat list of heading and paragraph blocks, so chunking knows nothing about file formats. `DocumentParser` is a strategy per file type. Plain text finds headings by shape. PDF has no structure, so paragraphs and headings are inferred from gaps and font sizes, and page numbers and running headers are dropped. A PDF without a text layer fails with a clear error, because there is no OCR.
4. Chunk it. `ChunkingStrategy` implementations are tried in priority order: by headings, by paragraphs, then a sliding window as the fallback for a wall of text. Chunking is deterministic, because chunk IDs (`<documentId>:<ordinal>`) depend on it. A heading without text of its own costs no chunk, and short neighbours merge to save model calls.
5. For each chunk not yet in the graph:
   - Extract entities (name, type, description) and triples with `completeStructured`, with the document name and heading path in the prompt.
   - Normalise: identity names, no self-loops, no repeats, no "names" that are really clauses. A triple endpoint the model forgot to list becomes an entity.
   - Resolve new names. Candidates come from the fulltext index, filtered by same type and by token subset or equality ignoring spaces, and only those reach an LLM yes/no. Fail closed: a wrong merge is worse than a duplicate.
   - Write in one transaction: `CREATE` the chunk (the unique constraint makes a repeat fail safely), merge entities, add `MENTIONS`, append to `RELATES_TO`, bump `revision`. Entities are locked in sorted order, so parallel chunks do not deadlock.
   - Update progress, then re-check the status. If the document is `deleting` or gone, run removal and stop.
6. Run the refresher, then mark the document `indexed`.

A chunk whose LLM output stays invalid after retries is counted in `chunksFailed` and skipped, so one bad chunk does not block a document. If every chunk fails, the document fails. An unavailable provider marks the document `failed`, and Retry resumes from the chunks already written. Retry is also offered for an `indexed` document with failed chunks. `CHUNK_CONCURRENCY` allows parallel chunks with a remote provider; keep it at 1 for a local model.

**Refresher.** It selects entities where `revision <> refreshedRevision` and rebuilds each description from its `MENTIONS` (unique, sorted, capped in config). It embeds in batches only when the description changed or there is no embedding yet, then writes the description, the embedding and `refreshedRevision` at the revision it read. A concurrent change therefore leaves the entity stale instead of being lost. It runs once per job, because re-embedding after every chunk would repeat work. Until it runs, new entities are invisible to QASA's traversal, which skips nodes without an embedding.

## Removal flow

1. `indexing-service` marks the document `deleting` and publishes a removal job. The UI shows it as being deleted.
2. `indexing-worker` removes the graph data, runs the refresher, deletes the file, deletes the row. Every step is idempotent, so redelivery is safe, and the row goes last, so a failure leaves the document visible and deletable again.

Indexing and removal use separate queues, so a removal does not wait behind a long document. Each queue has prefetch 1 on its own channel.

## Queue failure policy

An error in a job marks the document `failed` and the message is acked; the user retries from the UI. If the process dies, RabbitMQ redelivers the unacked message and the job resumes. A handler only throws when even marking the document failed did not work, which means a store is down, so the job is requeued after a pause. A malformed job would fail forever, so it is logged and dropped. There is no dead-letter queue or retry exchange.

Long documents can exceed RabbitMQ's 30-minute `consumer_timeout`. RabbitMQ 4 rejects `x-consumer-timeout` on classic queues, so `compose.yaml` raises the timeout for the whole broker, which serves only this system.

## Turn flow

`TurnService` works only through `conversations` and `query`, as an async generator of events that the controller writes to SSE. That keeps it testable without HTTP.

1. Save the user message. Load the summary and the messages after it. Over `HISTORY_MAX_TOKENS`, fold the oldest messages into the summary and keep `HISTORY_RECENT_TOKENS` of the newest, so that folding does not repeat on every turn.
2. `QueryAnalyzer` returns the route (`knowledge_base` or `conversation`) and a standalone question. With no history it skips the LLM: there is nothing to reformulate or to answer from. Invalid output falls back to the knowledge base and the question as it is.
3. The `AnswerStrategy` matching the route answers. `ConversationAnswerStrategy` uses only the history. `KnowledgeBaseAnswerStrategy` does the following:
   - `Retriever.retrieve` (implemented by `QasaRetriever`): LLM query entities with search hints, embeddings, one Cypher round-trip, path deduplication.
   - Emit the graph for the UI: nodes with activation and seed flag, edges with relations, weight and chunk IDs.
   - Build the context from paths, descriptions and source chunks within the budget. Chunks behind the strongest relations come first, then those mentioning the strongest entities.
   - Stream the answer. Citations are the source chunks that went into the prompt. A citation is the verbatim text of a chunk, because a quote generated by the model could be invented.
   - When retrieval finds nothing, the model gets a prompt that says so, which also handles greetings on a first message.
4. Save the assistant message with its metadata snapshot.

Events: analysis, graph, token, citations, done, error. `Chunk.documentName` means the assistant never reads the `documents` table. When the client disconnects, the generator stops at its next step, and the partial answer is not saved.

## Frontend

Two screens: documents (upload, status and progress by polling, delete, retry) and chat (conversations, chat, retrieved graph on the right, node size from activation, edge width from weight, seeds in another colour). Clicking an answer shows its graph. Data and state live in hooks and pure functions, views stay separate, so the later redesign touches only views. Answers stream with `fetch` and a readable stream, because `EventSource` cannot POST. nginx has `proxy_buffering off` for SSE.

## Build

One root `Dockerfile` builds any backend service from a `SERVICE` build argument: `pnpm fetch` into a cached layer, install, `pnpm --filter "$SERVICE..." build`, `pnpm --filter "$SERVICE" deploy --legacy --prod /out`, then copy `/out` into a slim image. Each image therefore holds only the packages that service declares. `apps/frontend` has its own Dockerfile because it ends in nginx. Vite and Vitest take `@graph-rag/contracts` from its sources, so the frontend needs no prior build of it.

## What was verified

On the Windows machine with Docker Desktop:

- The test suite: unit tests, and integration tests against real Neo4j 5.26 Community with APOC, Postgres 17 and RabbitMQ 4 through Testcontainers, with a fake LLM.
- QASA's Cypher with native cosine. On a fixture graph (`alice-manages->team-responsible for/owns->billing`, `bob-member of->team`; embeddings alice `[0.9,0.1,0]`, team `[0.6,0.8,0]`, billing `[0.8,0.6,0]`, bob `[0,1,0]`; question `[1,0,0]`), seeding from alice gives alice 1.0, team 1.26, billing 0.7056, and gates bob out, which matches a hand calculation. An empty graph returns empty results.
- Removal: on deleting one of two documents, the orphan went, the shared edge kept only the other document's relation, and the descriptions of the entities that stayed were rebuilt and re-embedded.
- A document deleted during indexing is cleaned up, a provider outage fails the document and Retry resumes without repeating chunks, and migrations from several services starting at once do not collide.
- The adapters' HTTP traffic against a local fake server, for both SDKs.
- A container reaches Ollama on the host through `host.docker.internal:11434`.
- Ollama's default `context_length` is 4096. JSON-schema `format` with `think: false` gave valid output on `qwen3.5:4b`. `gemma3:4b` also works with `format` but has no tools capability.
- RabbitMQ picks up `consumer_timeout` from `compose.yaml`, confirmed with `rabbitmqctl environment`.

The whole stack in Docker Compose with `qwen3.5:4b` and `qwen3-embedding:0.6b` in Ollama, on `test-data/section-1.txt`, `section-2.txt`, a Markdown runbook and a generated PDF:

- Extraction gave a clean graph: 50 entities with sensible types and relations, and valid JSON on all five chunks. Entities shared between documents merged, including across formats.
- Answers were correct on a handful of questions, including several hops across documents ("Who pages the Payments Council, and which team is that person on?"). A follow-up was reformulated correctly ("Who else is on that team?" became "Who else is on the Search Team?"), thanks went to the conversation route, and a question about something else got "could not find".
- Deleting `section-1.txt` took the graph from 50 to 36 entities with no stale entities or orphans left. Entities shared with other documents kept only their remaining descriptions, the file and the row went, questions about the deleted facts stopped being answered, and an old answer kept its graph and citations.
- A PDF without text failed with the OCR message, and a duplicate and an unsupported file were rejected.
- The UI was checked with a headless browser: the chat with sources, and the graph sized by the weights.

Not verified: anything on the Mac, OpenRouter's structured output and embeddings, a large document, a provider outage against the real stack, and systematic answer quality. Model speeds measured on the Windows GPU say nothing about the target.

## What real models taught

- `qwen3.5:4b` answers a bare yes/no about aliases almost at random, and got 4 of 9 test pairs right. Writing one sentence of reasoning first, as a schema field before the boolean, got 8 of 9.
- Vector scores do not separate relevant from irrelevant hints: on this graph, `(cos + 1) / 2` gave 0.77 to 0.89 for hints about something in the graph and 0.72 to 0.78 for unrelated ones. So there is no seed threshold, and off-topic questions rely on the prompt.

## Known limitations

- Retrieval always returns the nearest entities, so a graph and sources appear even when the model answers that it could not find anything, or replies to a greeting in a new conversation.
- If the RabbitMQ connection drops during a job, the redelivered message starts a second run next to the first. The chunk constraint keeps the graph correct, but the document can end up `failed` and need a Retry.
- A document that runs the worker out of memory is redelivered after the restart and does it again, until the queue is purged.
- Entity types are a fixed list in `extraction.ts`, tuned for organisational documents. Other domains fall back to `CONCEPT`.
- An entity keeps the type of its first mention, even if later chunks disagree.
