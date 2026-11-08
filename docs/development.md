# Development

## Commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm test:integration
pnpm test:cov
pnpm exec vitest run path/to/file.spec.ts
pnpm exec vitest run -t "test name"
pnpm --filter frontend dev
pnpm --filter @graph-rag/relational-store generate-migration
```

`pnpm test` runs unit and frontend tests. `pnpm test:integration` needs Docker but no LLM. Tests and `pnpm typecheck` work from package sources, so neither needs a build first. With the stack running in Docker, `pnpm --filter frontend dev` serves the UI with hot reload and sends API calls through the stack. To change a table, edit `packages/relational-store/src/tables.ts` and generate a migration; services apply migrations when they start.

## Structure

```
apps/
  indexing-service/src/   presentation, application, infrastructure/repositories
  indexing-worker/src/    presentation, infrastructure/{parsers,repositories}, application/
                            indexing/{parsing,chunking,extraction,resolution}, removal, knowledge
  assistant-service/src/  presentation, infrastructure/repositories, application/
                            conversations, turns, query/{analysis,retrieval,answering}
  frontend/src/           app, api, styles, features/{documents,chat,graph/flow}
packages/                 contracts, inference, graph-store, relational-store, file-store,
                          job-queue, nest-common, testing (dev only)
```

- **Packages** are shared libraries, never run on their own. Each service declares only the ones it needs. Code one service needs stays in that service, and code moves to a package only when two or more services use it.
- **Names** are plain roles, with no metaphors.
- **Folders** say what is inside, not what it runs on: `repositories/`, never `postgres/` or `neo4j/`. Vendor names appear only in adapters and inside implementations.
- **Layer folders** exist once per service, not per module. Domain processes sit inside `application/`, and pipeline steps nest under the process they belong to, never flat beside it.

## Backend code

Clean code is a hard requirement: class-based, strongly typed, small functions, small files, well-decomposed modules. There is no DDD, because there is no deep domain logic: no aggregates or rich domain models, only plain typed models.

| Layer            | Contains                                                                 | Must not                                |
| ---------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| `presentation`   | Controllers, queue consumers, DTOs                                       | Contain logic or call `infrastructure`  |
| `application`    | Services that orchestrate use cases, abstract classes for what they need | Know about drivers, SQL, Cypher or HTTP |
| `infrastructure` | Repositories, parsers and other adapters                                 | Contain use-case logic                  |

Dependencies point at `application`: `presentation -> application <- infrastructure`. `oxlint.json` enforces this.

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

## Frontend code

React function components and hooks. Keep data and state in hooks and pure functions, apart from view components, so that a redesign touches only the views. Each view imports its own CSS file, and colours and fonts are tokens in `styles/base.css`, each with its light and dark value through `light-dark()`.

The design is described in [Architecture](architecture.md#frontend). Keep the accent for what the graph has to say, and check every change in both themes. Animate through the presets in `app/motion.ts`: motion answers an event and then stops, and nothing moves while the page is idle. Tests skip animations through `src/test-setup.ts`, so an element that leaves still takes a tick, and needs `waitFor`.

## Tests

Every change ships with tests, and coverage stays above 80%. Dependency injection is what makes this cheap.

- **Unit (`*.spec.ts`, next to the code):** services and strategies with hand-written fakes of their abstractions, no network or containers.
- **Integration (`apps/<service>/test/integration/`, `packages/<package>/test/`):** real Neo4j, Postgres and RabbitMQ in Docker through Testcontainers, with a fake LLM and embedder so the tests need no GPU. Cover at least the QASA query on a small fixture graph (`qasa.spec.ts` has numbers worked out by hand), and deleting a document that shares entities with another one.
- Answer quality with real models is a separate evaluation, not part of the test run.

## Traps

- Node must be `^20.19 || >=22.12`. On an older Node, pnpm silently skips the native bindings of `rolldown` and `oxlint`, so vitest and oxlint crash with `Cannot find native binding`, `nest build` crashes with `ERR_REQUIRE_ESM`, and `tsc` still passes. After upgrading Node, delete `node_modules` and reinstall.
- pnpm exits 0 when downloading an optional package fails, so the same binding error can mean a network failure during install. Look for `WARN` in the install output.
- On the Windows dev machine, global Node is 22.11 and pnpm is not on PATH, and corepack fails on a signature check. Until Node is upgraded, prepend `%LOCALAPPDATA%\pnpm\nodejs\22.20.0` to PATH for the process and run `npx pnpm@10`. The Vite dev server there can also miss a file save and keep serving the old module: compare against `curl localhost:5173/src/...`, and `touch` the file.
- The Neo4j driver returns integers as plain numbers here (`disableLosslessIntegers`), but plain numbers go into Cypher as floats, so `LIMIT`, `k` and stored integers need `graphInt()`.
- `CREATE VECTOR INDEX IF NOT EXISTS` silently keeps an index with another dimension, and the index silently skips vectors of another size. `GraphStore` checks at startup and `DimensionCheckingEmbedder` on every call.
- Relative imports need a `.js` suffix (`module: nodenext`), except in `apps/frontend`, which Vite bundles.
- A constructor parameter imported with `import type` loses its decorator metadata, and Nest then cannot inject it. Import injected classes by value.
- `oxlint` does not find `oxlint.json` by itself and silently lints with defaults. Use `pnpm lint`, which passes `-c oxlint.json`.
