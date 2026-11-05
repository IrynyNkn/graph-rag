# Running

Everything runs in Docker, so Docker is all the system needs. Node is only for [development](development.md). Models run in Ollama on the host, because Docker on a Mac has no GPU, or behind an OpenAI-compatible API such as OpenRouter.

## Pick the models

The system has only run on a Windows PC with a GPU, so the fits below are estimates. Look at the machine first:

```bash
uname -m && sysctl -n hw.memsize
docker info --format '{{.MemTotal}}'
ollama list
```

The containers may use 3.6 GB in total and use about 1.5 GB at idle, so Docker needs at least 4 GB (in Docker Desktop: Settings, Resources). The default chat model takes 3.3 GB in Ollama and the embedding model 0.6 GB.

| Option                                | Fits                                 | Set in `.env`               |
| ------------------------------------- | ------------------------------------ | --------------------------- |
| Everything local, the default         | 16 GB of memory                      | Nothing                     |
| Chat through an API, embeddings local | 8 GB, or when local chat is too slow | The OpenRouter chat example |
| Both through an API                   | No Ollama                            | Both OpenRouter examples    |

The examples are in `.env.example`: copy it to `.env` and change what you need. Every value has a default, and API keys go only in `.env`.

- Local chat is too slow if `test-data/section-1.txt` takes more than a few minutes to index, or an answer more than a minute to start.
- An API chat model must support structured outputs: [these do on OpenRouter](https://openrouter.ai/models?supported_parameters=structured_outputs). The OpenAI-compatible adapter has only run against a fake server, so the check below is its first real test.
- Pick the embedding model before indexing anything, because changing it later means reindexing.

Once you know what works on a machine, write it down here.

## Start

Pull only what the chosen option keeps local:

```bash
ollama pull qwen3.5:4b
ollama pull qwen3-embedding:0.6b
```

```bash
docker compose up -d --build
docker compose ps
```

The first build takes a few minutes, and Neo4j's first start downloads APOC. The stack is up when `frontend` is running and the services with a healthcheck report healthy.

## Check it

Open http://localhost:8080, drop `test-data/section-1.txt` on the Documents screen and wait for `indexed`. On the Chat screen, ask "Who manages the Search Team?". The answer names Owen Blackwood, with its sources, and the graph draws on the right.

The same without a browser:

```bash
curl -F file=@test-data/section-1.txt http://localhost:8080/api/indexing/documents
curl http://localhost:8080/api/indexing/documents
curl -X POST http://localhost:8080/api/assistant/conversations
curl -N -H 'Content-Type: application/json' -d '{"content":"Who manages the Search Team?"}' \
  http://localhost:8080/api/assistant/conversations/<id>/turns
```

## Day to day

```bash
docker compose logs -f indexing-worker
docker compose up -d --build
docker compose down
docker compose down -v
```

`up --build` applies new code, `down` stops the stack and keeps the data, and `down -v` deletes the data too. The Neo4j browser is at http://localhost:7474, as `neo4j` with the password `graph-rag-local`.

## When it breaks

| Symptom                                               | What to do                                                                                                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A document or an answer fails with a connection error | Containers cannot reach Ollama. Check that it runs, then test from inside: `docker compose exec assistant-service node -e "fetch('http://host.docker.internal:11434/api/tags').then(r => r.text()).then(console.log)"` |
| Chunks fail, as in `3/4 chunks, 1 failed`             | The model does not keep to the JSON schema. Pick another one, and Retry                                                                                                                                                |
| `EACCES` on upload                                    | The `document-files` volume is older than the image and belongs to root: `docker compose down`, then `docker volume rm graph-rag_document-files`                                                                       |
| A service exits with `VectorIndexDimensionError`      | The embedding model changed, and vectors of different models cannot be compared: `docker compose down -v`, then upload the documents again                                                                             |
| A container exits with code 137                       | Out of memory. Give Docker more, or raise its `mem_limit` in `compose.yaml`                                                                                                                                            |
| The worker keeps restarting                           | A document runs it out of memory and is redelivered: `docker compose exec rabbitmq rabbitmqctl purge_queue documents.index`, then delete the document                                                                  |
| A port is taken                                       | Set `FRONTEND_PORT`, `NEO4J_BROWSER_PORT` or `NEO4J_BOLT_PORT` in `.env`                                                                                                                                               |
