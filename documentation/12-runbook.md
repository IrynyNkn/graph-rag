# 12. Runbook

Усі команди — з каталогу `graph-rag-api/`, якщо не сказано інше. Порт у прикладах `3111` (так тестувалось; дефолт застосунку — `3000`).

## 1. Передумови

- Docker Desktop
- Ollama (запущений, `http://localhost:11434`)
- Node.js + pnpm
- Вільне місце на диску: моделі (~5 GB для 7B + ~275 MB embeddings), Docker-образ Neo4j з GDS. На старті проєкту вільного було лише 9.5 GB — це було реальною перешкодою.

```bash
ollama pull qwen2.5:7b-instruct
ollama pull nomic-embed-text
```

## 2. Запуск Neo4j

```bash
docker compose up -d
```

- Browser: <http://localhost:7474>; Bolt: `bolt://localhost:7687`
- Облікові дані з `docker-compose.yml`: `neo4j` / `graphrag-local` (локальний dev-пароль, він і так лежить у репозиторії)
- `NEO4J_PLUGINS='["graph-data-science"]'` — образ **завантажує GDS Community** при першому старті контейнера (потрібен інтернет, може зайняти час). Дані — у volume `neo4j-data`.

Перевірка, що GDS підняв:

```bash
docker exec graph-rag-neo4j cypher-shell -u neo4j -p graphrag-local "RETURN gds.version()"
```

## 3. Запуск застосунку

```bash
cp .env.example .env      # необов'язково: дефолти зашиті в configuration.ts
pnpm install
PORT=3111 pnpm start:dev  # watch-режим
```

Або зібрати й запустити як у сесіях:

```bash
pnpm build
PORT=3111 node dist/main
```

На старті `GraphService` створює vector- та fulltext-індекси та порожню проєкцію `kg`. Якщо в лозі помилка про dimension — див. «Типові збої».

Щоб бачити debug-рядки агента, зберігай лог:

```bash
PORT=3111 pnpm start:dev 2>&1 | tee /tmp/graphrag.log
```

## 4. Наповнити граф

Один документ:

```bash
curl -s -X POST localhost:3111/ingest -H 'content-type: application/json' \
  -d '{"text":"Maria manages the Platform team. The Platform team is responsible for billing."}'
```

Секції Meridian по черзі (кожен `/ingest` = один малий документ):

```bash
for i in 1 2 3 4 5 6; do
  python3 -c 'import json,sys; print(json.dumps({"text": open(sys.argv[1]).read()}))' test-data/section-$i.txt \
  | curl -s -X POST localhost:3111/ingest -H 'content-type: application/json' -d @-
  echo
done
```

Орієнтир по часу: 5.8–61 с на малий документ на M1 Air; секція ≈ десятки секунд.

## 5. Поставити запитання

```bash
curl -s -X POST localhost:3111/query -H 'content-type: application/json' \
  -d '{"question":"Who manages the team responsible for billing?"}' | python3 -m json.tool
```

Дивитись і `answer`, і `subgraph.nodes/edges`. Скільки разів агент викликав tool:

```bash
grep 'local_retrieve(' /tmp/graphrag.log
```

Приклади запитань за групами — у [10](10-test-corpus-and-evaluation.md).

## 6. Дивитись у граф напряму

```bash
docker exec graph-rag-neo4j cypher-shell -u neo4j -p graphrag-local "MATCH (n:Entity) RETURN count(n) AS entities"
docker exec graph-rag-neo4j cypher-shell -u neo4j -p graphrag-local "MATCH ()-[r:REL]->() RETURN count(r) AS edges"
docker exec graph-rag-neo4j cypher-shell -u neo4j -p graphrag-local "MATCH ()-[r:REL]->() RETURN r.type AS type, count(*) AS n ORDER BY n DESC"
docker exec graph-rag-neo4j cypher-shell -u neo4j -p graphrag-local "MATCH (n:Entity) RETURN n.name ORDER BY n.name"
docker exec graph-rag-neo4j cypher-shell -u neo4j -p graphrag-local "SHOW INDEXES"
```

Чи існує конкретний вузол (напр., перед довірою до тесту):

```bash
docker exec graph-rag-neo4j cypher-shell -u neo4j -p graphrag-local "MATCH (n:Entity) WHERE n.name CONTAINS 'billing' RETURN n.name"
```

## 7. Очистити граф

**Деструктивно** — виконує власник графа, сам:

```bash
docker exec graph-rag-neo4j cypher-shell -u neo4j -p graphrag-local "MATCH (n:Entity) DETACH DELETE n"
```

- Видаляє всі `Entity` і всі ребра. Vector- та fulltext-індекси **лишаються** (вони прив'язані до властивостей, не до даних).
- GDS-проєкція `kg` стане застарілою, але перебудується автоматично після першого успішного ingest. Явно прибрати (необов'язково):

```bash
docker exec graph-rag-neo4j cypher-shell -u neo4j -p graphrag-local "CALL gds.graph.drop('kg', false) YIELD graphName RETURN graphName"
```

## 8. Перевірки якості коду

```bash
pnpm exec tsc --noEmit    # typecheck
pnpm lint                 # oxlint
pnpm test:e2e             # лише: DI-граф збирається
pnpm test                 # зараз скаже "No test files found"
```

`test:e2e` **не** перевіряє логіку.

## 9. Спайк LangGraph

```bash
cd ../langgraph-local-test
pnpm install
pnpm start                         # index.ts — StateGraph + ToolNode
pnpm exec tsx high-level.ts        # createReactAgent
pnpm exec tsx second-question.ts   # питання, що не потребує tool
```

Потрібен запущений Ollama з `qwen2.5:7b-instruct`.

## Типові збої

| Симптом | Причина | Що робити |
|---|---|---|
| Старт падає: `Vector index "entity_embedding" already exists with dimension X, but … expects Y` | Змінили embedding-модель / `EMBEDDING_DIMENSION` | Це навмисно ([06](06-neo4j-cypher-gds.md)). Скинути індекс (`DROP INDEX entity_embedding`), **пере-embed усіх вузлів** (готового скрипта нема — [11](11-known-issues-and-backlog.md)), перезапустити |
| `Ollama request failed (…)` / `Ollama embed request failed` | Ollama не запущений або модель не завантажена | `ollama serve`; `ollama list`; `ollama pull …` |
| `Extraction failed: LLM output did not match schema` | 7B повернув не той JSON | Повторити; скоротити текст; дивитись debug-лог `Extraction output:` |
| `gds.graph.project` / `gds.*` не знайдено | GDS не завантажився | `docker logs graph-rag-neo4j`; перевірити `NEO4J_PLUGINS`, інтернет під час першого старту |
| `/query` повертає порожню відповідь | Відомий збій A1 | Повторити запит; див. [11](11-known-issues-and-backlog.md) |
| `/query` до будь-якого ingest | Порожня проєкція — очікувано | Спершу `/ingest` |
| Дивні «I don't know» на відомі факти | Некалібрований поріг / вузол не знайдено | Порівняти з `grep 'local_retrieve('` (які seeds знайдено); перевірити, чи вузол є в графі (розділ 6) |
| Ingest «зависає» | Послідовні LLM-виклики на M1 | Це швидкість, не збій; дивитись CPU/Ollama; не запускати паралельно |
