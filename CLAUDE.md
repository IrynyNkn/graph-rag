# CLAUDE.md

Graph RAG over the user's documents, with a UI that shows the part of the knowledge graph behind each answer. NestJS services and a React frontend, with Neo4j, Postgres and RabbitMQ, all in Docker. Models run in Ollama on the host or behind an OpenAI-compatible API.

The target is a MacBook Air that is not very powerful. So far the system has only run on a Windows PC used for development, whose timings say nothing about the target.

## Docs

- [Running](docs/running.md): start it, pick models for this machine, fix what breaks. Start here on a new machine.
- [Architecture](docs/architecture.md): how it works and why. Read before changing a flow or the graph model.

## Rules

- Reply in the user's language, briefly. Everything written to the repo is in English.
- Think hard before answering, because the user should not have to point out banal flaws. No over-engineering.
- Everything must work on Mac and Windows: LF line endings, no OS-specific scripts, multi-arch images, modest memory limits.
- Every change ships with tests and keeps `docs/`, the README and this file current, without being asked. Docs stay short: what the code shows does not go in them.
- Typecheck and lint say nothing about extraction or retrieval quality. Check behaviour against live Neo4j and a model, and say what was verified and what is a hypothesis.
- API keys go only in `.env`, which is git-ignored.
- Commit messages are one short sentence in general words and past tense, like `implemented indexing service`, with nothing after it: no `Co-Authored-By` line or other attribution to Claude, which GitHub would list as a contributor.

## Writing code

Clean code is a hard requirement. These rules are imported, so they are always loaded:

@docs/development.md
