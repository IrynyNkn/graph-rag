# Документація проєкту Graph RAG

> Зріз знань станом на **2026-11-03** (останній коміт `7362b9d connect langgraph`).
> Джерела: код у `graph-rag-api/` та `langgraph-local-test/`, git-історія, і записи навчальних сесій з 6 вересня по 29 жовтня 2026.

## Що це за проєкт

Навчальний **Agentic Graph RAG**: система, яка з коротких текстових документів будує knowledge graph у Neo4j, а на запитання відповідає, обходячи цей граф, і повертає разом з відповіддю **підграф, який було використано** (explainability). Усе працює локально: Ollama (`qwen2.5:7b-instruct` + `nomic-embed-text`) і Neo4j у Docker.

Проєкт водночас є капстоуном 6-тижневого backend-refresher плану (NestJS, Postgres, RabbitMQ, Docker…) і способом з нуля вивчити RAG / Graph RAG. Тому в коді багато коментарів про «чому», а рішення приймалися через Socratic dialogue.

## Де ми зараз

| Stage | Суть | Стан | Коміт |
|---|---|---|---|
| 0 | Walking skeleton: extract triples → `MERGE` → exact match → 1-hop → answer | ✅ | `e48bb27` (25 вер) |
| 1 | Embeddings + Neo4j vector index для seed nodes | ✅ | `f7f438f` (28 вер) |
| 2 | Personalized PageRank (GDS) для multi-hop | ✅ | `fc37214` (30 вер) |
| 3.1 | Relation vocabulary, що росте з графа | ✅ | `aa5d286` (7 жов) |
| 3.2 | Entity resolution на ingest (vector + fulltext + LLM confirm) | ✅ | `fc45352` (9 жов) |
| 3.3 | Provenance (звідки взявся факт) | ⏸ свідомо відкладено до Stage 6 | — |
| 4 | Агентний шар на LangGraph (`local_retrieve` у циклі) | ✅ (з відомими проблемами) | `7362b9d` (3 лис) |
| 5 | Global-питання (Leiden communities + summaries) | ⬜ не починали | — |
| 6 | SSE-стрімінг, черга ingest, eval-harness, UI | ⬜ не починали | — |

**UI (чат ліворуч, граф праворуч) ще не існує** — є лише HTTP API (`POST /ingest`, `POST /query`).

## Карта документації

| Файл | Про що |
|---|---|
| [01-overview.md](01-overview.md) | Ідея, цілі, обмеження, стек, структура репозиторію, навчальний контекст |
| [02-architecture.md](02-architecture.md) | NestJS-модулі, залежності, модель даних у Neo4j, конфіг, HTTP-контракти |
| [03-roadmap-stages.md](03-roadmap-stages.md) | Драбина Stage 0–6: що зроблено, що ні, чому в такому порядку |
| [04-ingest-pipeline.md](04-ingest-pipeline.md) | Як текст стає графом: extraction, нормалізація, entity resolution, embeddings |
| [05-query-and-agent.md](05-query-and-agent.md) | Як запитання стає відповіддю: LangGraph-агент, `local_retrieve`, PPR |
| [06-neo4j-cypher-gds.md](06-neo4j-cypher-gds.md) | Усі Cypher-запити, індекси, GDS, пастки драйвера |
| [07-concepts-learned.md](07-concepts-learned.md) | Теорія з навчальних модулів, прив'язана до місця в коді |
| [08-design-decisions.md](08-design-decisions.md) | Журнал рішень: що вирішили, чому, які були альтернативи |
| [09-empirical-findings.md](09-empirical-findings.md) | Що перевірили на живому Neo4j/Ollama, з цифрами |
| [10-test-corpus-and-evaluation.md](10-test-corpus-and-evaluation.md) | Тестові корпуси, набір запитань, результати прогону Stage 4 |
| [11-known-issues-and-backlog.md](11-known-issues-and-backlog.md) | Відкриті проблеми, гіпотези, наступні кроки |
| [12-runbook.md](12-runbook.md) | Як запустити, наповнити граф, поставити запит, налагодити |
| [13-working-agreements.md](13-working-agreements.md) | Як ми працюємо разом: мова, стиль, правила перевірки |
| [14-glossary.md](14-glossary.md) | Словник термінів |

## З чого почати

- **Швидко відновити контекст** → цей файл, потім [05-query-and-agent.md](05-query-and-agent.md) і [11-known-issues-and-backlog.md](11-known-issues-and-backlog.md).
- **Запустити проєкт** → [12-runbook.md](12-runbook.md).
- **Зрозуміти «чому так»** → [08-design-decisions.md](08-design-decisions.md) і [09-empirical-findings.md](09-empirical-findings.md).
- **Підготуватись до розмови про проєкт на співбесіді** → [07-concepts-learned.md](07-concepts-learned.md) + розділ «Чому» в [08-design-decisions.md](08-design-decisions.md).

## Наскільки можна довіряти написаному

Позначки, які трапляються в документах:

- **Перевірено в коді** — прочитано в `src/` на момент зрізу; є посилання на файл.
- **Перевірено живцем** — за записами сесій це підтверджено запуском проти реального Neo4j/Ollama (з датою або числами).
- **Гіпотеза** — пояснення, яке узгоджується зі спостереженнями, але не доведене.
- **Спостереження з читання коду** — висновок із коду без окремого запуску.

Документація не замінює код: якщо вони розходяться, правий код. Місця, де я не впевнений, названі прямо.
