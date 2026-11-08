# Architecture

How the system works and why. What the code shows by itself is left out. None of this is a commitment: when the code shows a better shape, change it and update this file.

```
frontend -> indexing-service -> RabbitMQ -> indexing-worker -> Neo4j
frontend -> assistant-service -> Neo4j
indexing-service, indexing-worker, assistant-service -> Postgres
indexing-worker, assistant-service -> LLM provider (Ollama on the host, or an API)
```

| Service             | Responsibility                                                                 |
| ------------------- | ------------------------------------------------------------------------------ |
| `frontend`          | React UI behind nginx, which also proxies to both APIs, so there is no CORS    |
| `indexing-service`  | Accepts files, lists documents and their status, requests deletion and retries |
| `indexing-worker`   | Builds the graph from documents and removes documents from it. No HTTP         |
| `assistant-service` | Conversations and answers, streamed over SSE                                   |

Neo4j holds the graph with its source chunks. Postgres holds document metadata and status, and conversations. Original files live on a shared Docker volume. Indexing and chat are separate flows, with no scheduling priority between them. Services apply migrations and the graph schema when they start, under a lock, so there is no separate migration step.

## Graph model

```
(:Chunk {id, documentId, documentName, ordinal, text})-[:MENTIONS {description}]->(:Entity)
(:Entity {name, type, description, descriptionEmbedding, revision, refreshedRevision})
(:Entity)-[:RELATES_TO {relations: [...], chunkIds: [...]}]->(:Entity)
```

- There is one `RELATES_TO` per ordered entity pair, as in QASA, so its algorithm ports unchanged. `relations[i]` came from `chunkIds[i]`.
- `normalizeEntityName` in `contracts` is the identity of an entity. Indexing writes through it and retrieval looks up through it.
- `Entity.description` is derived from the `MENTIONS` descriptions. Every change to an entity's mentions bumps `revision`. A refresher processes stale entities (`revision <> refreshedRevision`) once at the end of each job: it rebuilds the description, re-embeds in batches only if it changed, and deletes entities with no mentions left. Indexing and removal share it, and it survives crashes because staleness is stored in the graph. Until it runs, new entities are invisible to QASA, which skips nodes without an embedding.
- A citation is the verbatim text of a chunk. The model does not generate quotes: they could be invented, and they cost tokens.
- Each answer keeps a snapshot of its graph and citations in Postgres, so it stays readable after a document is deleted.

## Indexing

One queue message per document, processed chunk by chunk. Each chunk is one Neo4j transaction with a deterministic ID (`<documentId>:<ordinal>`), so redelivery resumes where it stopped.

1. `indexing-service` inserts a `queued` row (a unique content hash rejects duplicates), saves the file and publishes a job. There is no outbox: a failed publish marks the document `failed`, and Retry covers it.
2. A parser per file type produces a flat list of heading and paragraph blocks, so chunking knows nothing about formats. PDF has no structure, so blocks are inferred from gaps and font sizes. A PDF without a text layer fails with a clear error, because there is no OCR.
3. Chunking strategies are tried in priority order: by headings, by paragraphs, then a sliding window. Chunking must stay deterministic, because chunk IDs depend on it.
4. For each chunk not yet in the graph: extract entities and triples, normalise them, resolve new names against known entities, write, then re-check the status and clean up if the document is being deleted. Resolution fails closed, because a wrong merge is worse than a duplicate. Entities are locked in sorted order, so parallel chunks do not deadlock.
5. Run the refresher and mark the document `indexed`.

A chunk whose LLM output stays invalid after retries is counted in `chunksFailed` and skipped. If every chunk fails, the document fails. An unavailable provider marks the document `failed`, and Retry resumes from the chunks already written.

## Removal

The API marks the document `deleting` and queues a message. The worker removes its chunks and their entries in `RELATES_TO`, deletes emptied relations, runs the refresher, then deletes the file and the row. Every step is idempotent, and the row goes last, so a failure leaves the document visible and deletable again. Orphans go with a plain `DELETE`, not `DETACH DELETE`: if a concurrent job has just attached a mention, the delete fails and is retried rather than destroying it.

Indexing and removal use separate queues, so a removal does not wait behind a long document.

## Queue failures

An error in a job marks the document `failed` and the message is acked; the user retries from the UI. If the process dies, RabbitMQ redelivers the message and the job resumes. A handler throws only when even marking the document failed did not work, which means a store is down, so the job is requeued after a pause. A malformed job is logged and dropped. There is no dead-letter queue.

## A turn

`TurnService` is an async generator of events (analysis, graph, token, citations, done, error) that the controller writes to SSE, which keeps it testable without HTTP.

1. Save the user message and load the history. Over `HISTORY_MAX_TOKENS`, the oldest messages fold into a summary.
2. A router returns the route (`knowledge_base` or `conversation`) and a standalone question. With no history it skips the LLM. Invalid output falls back to the knowledge base and the question as it is.
3. The strategy for the route answers. For the knowledge base: retrieve with QASA, emit the graph, build the context within the budget, dropping the lowest weights first, and stream the answer.
4. Save the answer with its snapshot. When the client disconnects, the generator stops at its next step and the partial answer is not saved.

Editing a question, or asking it again, sends the turn with `replacesFromMessageId`: before the turn starts, the service deletes that question and everything after it, so the new turn never sees the history it replaces. Deleting from a question works the same way without asking anything. A summary that covered a deleted message is dropped and folds again when needed, and a conversation left empty loses its title, so that its next question names it. Message IDs only grow, so "after" means a larger ID.

## QASA

Query-Aware Spreading Activation, ported from `qasa_retriever.py` in `github.com/kinfi4/qasa-graph-rag` (MIT). It is not a dependency: clone it only into a temp folder. The port is `qasa.query.ts`, which keeps all state in a single stateless query instead of temporary node properties, so concurrent questions cannot disturb each other. It needs APOC but not GDS: `gds.similarity.cosine(a, b)` becomes `2 * vector.similarity.cosine(a, b) - 1`, because the native scale is `(cos + 1) / 2`.

## Inference

Chat and embedding providers are configured separately, and each service sets its own chat model. Ports are abstract classes, so Nest resolves them by constructor type. Adding a provider takes a new adapter, a line in `InferenceModule`, a value in `providerSchema` and a config value. OpenRouter and ChatGPT share the OpenAI-compatible adapter.

- Everything streams, even when the caller wants the whole text: a slow local model would otherwise hit fetch's five-minute wait for response headers.
- The Ollama adapter sets `num_ctx`, because the default of 4096 silently truncates longer prompts. Every prompt is budgeted to fit, and a service refuses to start when the budgets do not fit `CHAT_CONTEXT_WINDOW`.
- Decorators retry with backoff, and a stream only before its first token.
- Embed in batches, never one by one in a loop: on the Windows GPU a batch of 32 cost 79 ms per text, and single calls about 2 s each.

## Frontend

Two screens: documents, and chat with the retrieved graph on the right. Answers stream with `fetch` and a readable stream, because `EventSource` cannot POST.

The design is a calm, neutral product with light and dark themes, which follow the system until the user picks one. Colours are warm greys, with one accent kept for what the graph has to say: seeds and the strongest path. Primary actions use the inverted neutral, not the accent. Fonts are self-hosted, so the app needs no network.

There is no sidebar of chats, because that is the layout every chat app has, and this is a tool for looking at a graph. Conversations live in a palette that opens from the top bar or with Cmd+K or Ctrl+K, and the graph gets the width a sidebar would take. A snapshot of the sidebar layout is kept in `git stash`, in case it is wanted back.

The graph is a deterministic flow in `features/graph/flow/`, because a force layout overlaps its labels. Each column is one hop further from the seed, chips stay apart, and a dense graph draws smaller, down to 70%, before the panel scrolls. Chip text gets brighter with activation, on a root scale because a few nodes take most of it, and line width follows edge weight. The strongest path is the way from the first column with the most total weight. Chip widths are estimated from letter widths, so layout needs no canvas and no loaded font: a line starts hidden behind its chip, so a wrong estimate cannot show a gap.

Motion follows events and stops when nothing happens, which also saves the battery. The graph unfolds a hop at a time, and when another graph replaces it, what the two share travels to its new place, because edges and chips keep their identity. That needs every line to have the same path commands. The graph and older turns are memoised, because the page re-renders for every token.

## What real models taught

- `qwen3.5:4b` answers a bare yes/no about aliases almost at random, and got 4 of 9 test pairs right. Writing one sentence of reasoning first, as a schema field before the boolean, got 8 of 9.
- Vector scores do not separate relevant from irrelevant hints: `(cos + 1) / 2` gave 0.77 to 0.89 for hints about something in the graph and 0.72 to 0.78 for unrelated ones. So there is no seed threshold, and off-topic questions rely on the prompt.

## What was verified

On the Windows PC with Docker Desktop, `qwen3.5:4b` and `qwen3-embedding:0.6b`: the test suite; extraction, entity merging across documents and formats, multi-hop answers, follow-up reformulation and routing on `test-data/`; removal leaving no stale entities or orphans; the UI in headless Chrome at sizes from 1440x900 down to 390x844, in both themes, with a live answer streamed into it; and a clean clone started from nothing by following [Running](running.md). All four images also build for arm64 under emulation, where the services load as far as their config check and nginx accepts its config.

Not verified: anything on the Mac, the UI in Safari, OpenRouter against the real API, a large document, a provider outage against the real stack, and systematic answer quality.

## Known limitations

- Retrieval always returns the nearest entities, so a graph and sources appear even when the model answers that it could not find anything, or replies to a greeting in a new conversation.
- If the RabbitMQ connection drops during a job, the redelivered message starts a second run next to the first. The chunk constraint keeps the graph correct, but the document can end up `failed` and need a Retry.
- A document that runs the worker out of memory is redelivered after the restart and does it again, until the queue is purged.
- Documents are assumed to be in English.
- Entity types are a fixed list in `extraction.ts`, tuned for organisational documents. Other domains fall back to `CONCEPT`.
- An entity keeps the type of its first mention, even if later chunks disagree.
