# Visualized Graph RAG

Ask questions about your documents and see the part of the knowledge graph behind each answer.

Documents (PDF with a text layer, TXT, MD) are turned into a knowledge graph with an LLM. Questions go through a small pipeline: history with summarisation, a router that decides whether retrieval is needed, reformulation, graph retrieval, and a streamed answer with its sources. The UI draws the retrieved subgraph next to the chat, with node size and edge width taken from the retrieval weights.

Retrieval uses QASA (Query-Aware Spreading Activation), ported to TypeScript from [kinfi4/qasa-graph-rag](https://github.com/kinfi4/qasa-graph-rag) (MIT). It is a port, not a dependency.

## Run it

You need Docker, and either [Ollama](https://ollama.com) on the host or an API key for an OpenAI-compatible provider such as OpenRouter.

With Ollama, pull the default models:

```bash
ollama pull qwen3.5:4b
```

```bash
ollama pull qwen3-embedding:0.6b
```

Start everything:

```bash
docker compose up --build
```

Then open http://localhost:8080, upload a document on the Documents screen, wait until it is indexed, and ask about it on the Chat screen. `test-data/` has a small corpus to try.

To use another model or provider, copy `.env.example` to `.env` and change the values there. Chat and embeddings are configured separately, so embeddings can stay local while chat goes through a paid API. Changing the embedding model means reindexing, because vectors of different models cannot be compared.

## How it fits together

```
frontend -> indexing-service -> RabbitMQ -> indexing-worker -> Neo4j
frontend -> assistant-service -> Neo4j
indexing-service, indexing-worker, assistant-service -> Postgres
indexing-worker, assistant-service -> LLM provider (Ollama on the host, or an API)
```

| Service             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `frontend`          | React UI behind nginx, which also proxies to both APIs        |
| `indexing-service`  | Accepts files, lists documents, requests deletion and retries |
| `indexing-worker`   | Builds the graph from documents and removes documents from it |
| `assistant-service` | Conversations and answers, streamed over SSE                  |

Neo4j holds the knowledge graph with its source chunks. Postgres holds document metadata and conversations. Original files live on a shared Docker volume.

The design is in [docs/architecture.md](docs/architecture.md).

## Develop

The repository is a pnpm workspace. It needs Node `^20.19` or `>=22.12`.

```bash
pnpm install
```

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

Integration tests start real Neo4j, Postgres and RabbitMQ through Testcontainers, so they need Docker but no LLM:

```bash
pnpm test:integration
```

For the coverage report, which runs both kinds of tests:

```bash
pnpm test:cov
```

With the stack running in Docker, `pnpm --filter frontend dev` serves the UI with hot reload and sends API calls through the stack.

To change a table, edit `packages/relational-store/src/tables.ts` and run `pnpm --filter @graph-rag/relational-store generate-migration`. Services apply migrations when they start.
