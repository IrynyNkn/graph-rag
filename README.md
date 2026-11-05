# Visualized Graph RAG

Ask questions about your documents and see the part of the knowledge graph behind each answer.

Documents (PDF with a text layer, TXT, MD) become a knowledge graph through an LLM. A question goes through history with summarisation, a router that decides whether retrieval is needed, reformulation, graph retrieval, and a streamed answer with its sources. The UI draws the retrieved subgraph next to the chat as a transit map, with stop size and line width taken from the retrieval weights.

## Run it

With Docker, and [Ollama](https://ollama.com) on the host:

```bash
ollama pull qwen3.5:4b
ollama pull qwen3-embedding:0.6b
docker compose up -d --build
```

Then open http://localhost:8080. Other models and providers, and what to do when something breaks, are in [docs/running.md](docs/running.md).

## More

- [docs/architecture.md](docs/architecture.md): how it works and why.
- [docs/development.md](docs/development.md): code rules, tests and commands.

## Credits

Retrieval uses QASA (Query-Aware Spreading Activation), ported to TypeScript from [kinfi4/qasa-graph-rag](https://github.com/kinfi4/qasa-graph-rag) (MIT). It is a port, not a dependency.
