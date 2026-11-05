# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

**The design is in `docs/architecture.md`. Read it before changing the code.** The structure is a starting point, not a commitment: when the code shows a better shape, change it and update the docs. No over-engineering, and think hard before answering, because the user should not have to point out banal flaws.

## Language

- Replies to the user: Russian, and short. Russian is used nowhere else.
- Everything written to the repo (code, comments, prompts, commit messages, docs, this file): English.

## System

Graph RAG over the user's documents, with a UI that shows the part of the knowledge graph behind each answer.

```
frontend -> indexing-service -> RabbitMQ -> indexing-worker -> Neo4j
frontend -> assistant-service -> Neo4j
indexing-service, indexing-worker, assistant-service -> Postgres
indexing-worker, assistant-service -> LLM provider (OpenRouter, or Ollama on the host)
```

- **Services:** `indexing-service`, `indexing-worker` and `assistant-service` on NestJS with TypeScript; `frontend` on React.
- **Storage:** Neo4j holds the knowledge graph with its source chunks. Postgres holds document metadata and status, and conversations. Original files live on a shared Docker volume.
- **Runtime:** everything runs in Docker. Ollama, when used, stays on the host because Docker on a Mac has no GPU, and containers reach it at `host.docker.internal:11434`.
- **Machines:** the Windows PC is only for development; timings on its GPU say nothing about the target. The system runs on a MacBook Air that is not very powerful, so keep memory limits modest. Everything must work on both: LF line endings, no OS-specific scripts, multi-arch images.
- **Models:** chat and embedding providers are configured separately: Ollama locally, or an OpenAI-compatible API such as OpenRouter. The Ollama adapter must set `num_ctx` explicitly, because the default is 4096 and longer prompts are silently truncated. Budget each prompt to fit.
- **Documents:** PDF without OCR, TXT and MD, in English for now. The chunking strategy is detected per document.
- **Retrieval:** QASA (Query-Aware Spreading Activation), ported to TypeScript from the user's repo `github.com/kinfi4/qasa-graph-rag` (MIT). It is not a dependency: clone it only into a temp folder, and credit it in the README. It needs APOC but not GDS: use native `vector.similarity.cosine`, whose scale is `(cos + 1) / 2`, and convert back with `2 * s - 1` (verified on Neo4j 5.26).
- **Query flow:** chat history with summarisation of long chats, a router that decides whether RAG is needed, question reformulation, retrieval, answer.
- **UI:** a documents screen, and a chat screen with the chat on the left and the retrieved graph on the right, drawn with QASA weights (activation on nodes, path weight on edges) as a transit map in SVG.
- **Independence:** indexing and chat are separate flows, with no scheduling priority between them.

## Structure

```
apps/
  indexing-service/src/   presentation, application, infrastructure/repositories
  indexing-worker/src/    presentation, infrastructure/{parsers,repositories}, application/
                            indexing/{parsing,chunking,extraction,resolution}, removal, knowledge
  assistant-service/src/  presentation, infrastructure/repositories, application/
                            conversations, turns, query/{analysis,retrieval,answering}
  frontend/src/           app, api, styles, features/{documents,chat,graph/schematic}
packages/                 contracts, inference, graph-store, relational-store, file-store,
                          job-queue, nest-common, testing (dev only)
docs/
```

- **Packages** are shared libraries, never run on their own. Each service declares only the ones it needs. Code one service needs stays in that service.
- **Names** are plain roles, with no metaphors.
- **Folders** say what is inside, not what it runs on: `repositories/`, never `postgres/` or `neo4j/`. Vendor names appear only in adapters and inside implementations.
- **Layer folders** exist once per service, not per module. Domain processes sit inside `application/`, and pipeline steps nest under the process they belong to, never flat beside it.

## Graph model

```
(:Chunk {id, documentId, documentName, ordinal, text})-[:MENTIONS {description}]->(:Entity)
(:Entity {name, type, description, descriptionEmbedding, revision, refreshedRevision})
(:Entity)-[:RELATES_TO {relations: [...], chunkIds: [...]}]->(:Entity)
```

- There is one `RELATES_TO` per ordered entity pair, as in QASA, so its algorithm ports unchanged. `relations[i]` came from `chunkIds[i]`.
- `Entity.description` is derived from the `MENTIONS` descriptions. Every change to an entity's mentions bumps `revision`. A refresher processes stale entities (`revision <> refreshedRevision`) once at the end of each job: it rebuilds the description, re-embeds in batches only if it changed, and deletes entities with no mentions left. Indexing and deletion share it, and it survives crashes because staleness is stored in the graph.
- A citation is the verbatim text of a chunk. The model does not generate quotes: they could be invented, and they cost tokens.
- **Indexing:** one queue message per document, processed chunk by chunk. Each chunk is one Neo4j transaction with a deterministic ID, so redelivery resumes where it stopped.
- **Deletion:** the API marks the document `deleting` and queues a message. The worker removes its chunks and their entries in `RELATES_TO`, deletes emptied relations, runs the refresher, then deletes the file and the Postgres row. Every step is idempotent. An indexing job re-checks the status after each chunk write and cleans up if the document is being deleted.

## Backend code

Clean code is a hard requirement: class-based, strongly typed, small functions, small files, well-decomposed modules.

**Layers.** No DDD: there is no deep domain logic, so no aggregates or rich domain models, only plain typed models.

| Layer            | Contains                                                                 | Must not                                |
| ---------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| `presentation`   | Controllers, queue consumers, DTOs                                       | Contain logic or call `infrastructure`  |
| `application`    | Services that orchestrate use cases, abstract classes for what they need | Know about drivers, SQL, Cypher or HTTP |
| `infrastructure` | Repositories, parsers and other adapters                                 | Contain use-case logic                  |

Dependencies point at `application`: `presentation -> application <- infrastructure`.

**Rules.**

- Follow the open-closed principle. Anything that could be swapped (LLM provider, embedder, retrieval algorithm, file parsers, chunking, file storage, queue, database adapters) sits behind an abstract class as a Strategy or adapter, never behind an `if` or `switch` on a type or a boolean flag. Moving from Ollama to ChatGPT must take only a new adapter, its registration in a Nest module and a config value.
- Inject collaborators through the constructor. Only Nest modules choose implementations.
- Database access lives only in repositories, which return typed models, never driver records or rows.
- One class per file, except typed errors of one module, which can share an `errors.ts`. Name classes after their role (`TripleExtractor`, `EntityResolver`), never `Manager`, `Helper` or `Utils`.
- Keep functions under about 25 lines and files under about 200. Prefer early returns to nesting. Lines up to 100 characters.
- No `any` and no non-null `!`. Everything entering the system is `unknown` until validated with zod: HTTP bodies, queue messages, env and LLM output.
- Each service has one validated config class. No `process.env` elsewhere and no magic numbers: models, thresholds and top-K values are config.
- Each prompt lives in its own `*.prompt.ts` file and is imported; queries likewise live in their own files. Cypher and SQL use bound parameters only and are never built from LLM output.
- Use typed error classes and map them to responses in `presentation`. Never swallow an error.
- Queue consumers are idempotent, because redelivery must be safe.
- Comments only for a non-obvious "why". No narrating comments and no commented-out code.
- No over-engineering: what can never be swapped stays a plain class or function, with no abstraction of its own.
- Code moves to a shared package only when two or more services use it.

## Frontend code

React function components and hooks. Keep data and state in hooks and pure functions, apart from view components, so that a redesign touches only the views. Each view imports its own CSS file, and colours and fonts are tokens in `styles/base.css`.

The design is a two-colour risograph print of a transit map, described in `docs/architecture.md`. Keep to its two inks on paper: a new state gets a new form, not a new colour.

## Documentation

You own the docs. Keep `docs/`, the README and this file current as part of every change, without being asked. New docs go in `docs/`.

## Tests

Every change ships with tests, and coverage stays above 80%. Dependency injection is what makes this cheap.

- **Unit (`*.spec.ts`, next to the code):** services and strategies with hand-written fakes of their abstractions, no network or containers.
- **Integration (`apps/<service>/test/integration/`, `packages/<package>/test/`):** real Neo4j, Postgres and RabbitMQ in Docker through Testcontainers, with a fake LLM and embedder so the tests need no GPU. Cover at least the QASA query on a small fixture graph, and deleting a document that shares entities with another one. `docs/architecture.md` has a fixture with hand-checked numbers.
- Answer quality with real models is a separate evaluation, not part of the test run.

## Verification

Typecheck and lint say nothing about extraction or retrieval quality. Check behaviour against live Neo4j and an LLM provider, and say what was verified and what is a hypothesis.

## Commands

```bash
pnpm install
docker compose up -d --build
pnpm build
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm test:integration
pnpm test:cov
pnpm exec vitest run path/to/file.spec.ts
pnpm exec vitest run -t "test name"
pnpm --filter @graph-rag/relational-store generate-migration
```

`pnpm test` runs unit and frontend tests. `pnpm test:integration` needs Docker but no LLM. Tests and `pnpm typecheck` work from package sources, so neither needs a build first.

## Known traps

- Node must be `^20.19 || >=22.12`. On an older Node, pnpm silently skips the native bindings of `rolldown` and `oxlint`, so vitest and oxlint crash with `Cannot find native binding`, `nest build` crashes with `ERR_REQUIRE_ESM`, and `tsc` still passes. After upgrading Node, delete `node_modules` and reinstall.
- pnpm exits 0 when downloading an optional package fails, so the same binding error can mean a network failure during install. Look for `WARN` in the install output.
- On the Windows dev machine, global Node is 22.11 and pnpm is not on PATH, and corepack fails on a signature check. Until Node is upgraded, prepend `%LOCALAPPDATA%\pnpm\nodejs\22.20.0` to PATH for the process and run `npx pnpm@10`.
- The Neo4j driver returns integers as plain numbers here (`disableLosslessIntegers`), but plain numbers go into Cypher as floats, so `LIMIT`, `k` and stored integers need `graphInt()`.
- `CREATE VECTOR INDEX IF NOT EXISTS` silently keeps an index with another dimension, and the index silently skips vectors of another size. `GraphStore` checks at startup and `DimensionCheckingEmbedder` on every call. Changing the embedding model means reindexing.
- RabbitMQ's default `consumer_timeout` (30 minutes) can close the channel during a long document. RabbitMQ 4 rejects `x-consumer-timeout` on classic queues, so `compose.yaml` raises it for the whole broker.
- A named volume takes its owner from the image directory only when it is first created. The root `Dockerfile` prepares `/data/files` for the `node` user; a volume created before that stays root-owned and needs removing.
- Relative imports need a `.js` suffix (`module: nodenext`), except in `apps/frontend`, which Vite bundles.
- A constructor parameter imported with `import type` loses its decorator metadata, and Nest then cannot inject it. Import injected classes by value.
- On the Windows dev machine, the Vite dev server can miss a file save and keep serving the old module, so a fix looks as if it did nothing. Compare against `curl localhost:5173/src/...`, and `touch` the file.
- `oxlint` does not find `oxlint.json` by itself and silently lints with defaults. Use `pnpm lint`, which passes `-c oxlint.json`.
