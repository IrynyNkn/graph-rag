# 01. Огляд проєкту

## Початкова ідея (6 вересня 2026)

Дослівний опис, з якого все почалось (українською, як було сформульовано):

> Є чатик, де користувач вантажить документ або може питати щось (два UI).
> В першому випадку агент парсить файл та оновлює Knowledge Graph (neo4j) на основі даних з файлу.
> В другому випадку агент отримує питання користувача та виконує пошук по графу (алгоритм просто взяти чийсь, типу HippoRAG абощо).
> На UI буде показуватись ліворуч чатик з агентом, а праворуч з'являтись граф який був використаний для відповіді.
> LLM — щось локальне. Дає explainability, transparency системи.

Два режими:

| Режим | Що робить | Реалізовано |
|---|---|---|
| **Ingest** | документ → LLM витягує triples → upsert у Neo4j → embeddings → оновлення GDS-проєкції | ✅ `POST /ingest` |
| **Query** | питання → агент шукає по графу (0..N разів) → відповідь + підграф | ✅ `POST /query` |
| **UI** | чат + візуалізація використаного підграфа | ⬜ |

**Value proposition — explainability:** кожна відповідь повертає `subgraph` (вузли й ребра, на яких вона трималась). Саме тому система тримається за «граф, збудований кодом із перевірюваних фактів», а не за векторний пошук по чанках.

## Навчальний контекст

Проєкт почався з файлу `backend-refresher-learning-plan.md` (6 тижнів). За задумом він лежить наскрізь через усі тижні:

| Тиждень | Тема плану | Де в цьому проєкті |
|---|---|---|
| 1 | Node/Nest: модулі, DI, pipes, streams | Структура модулів, `ValidationPipe`, DI; SSE-стрімінг (план) |
| 2 | PostgreSQL | Метадані: документи, provenance, eval-запуски (план) |
| 3 | Mongo + gRPC/ConnectRPC | Сховище сирих документів / винесення ingest в сервіс (план) |
| 4 | Auth0 + RabbitMQ | Логін; ingest як черга з DLQ та idempotent consumers (план) |
| 5 | Docker/K8s/AWS | Образи, Neo4j + LLM як deployments (план) |
| 6 | System design | 1-pager про готову систему (план) |

Фактично реалізовано поки лише тиждень 1 (+ Docker для Neo4j).

**Стартовий рівень:** на діагностичному тесті 6 вересня — «pre-beginner on RAG mechanics» (правильно описано лише загальну ідею RAG). Далі був курс із 8 модулів (див. [07-concepts-learned.md](07-concepts-learned.md)), після якого більшість архітектурних рішень проєкту приймались самостійно з аргументацією.

## Обмеження, які визначають дизайн

| Обмеження | Наслідок |
|---|---|
| **Лише маленькі документи** (рішення 8 вересня) | Немає chunking; один `/ingest` = один невеликий текст = 1 LLM-виклик на extraction |
| **Ітеративний підхід** — від найпростішого RAG до складного | Драбина Stage 0→6, кожен щабель окремо працює й тестується |
| **Локальна LLM** | Усі промпти розраховані на 7B-модель; JSON mode Ollama замість grammar-constrained decoding |
| **MacBook Air M1, 16 GB, без активного охолодження** | Ingest повільний (5.8–61 с на документ); ризик throttling під навантаженням |
| На момент оцінки було лише 9.5 GB вільного диска | Рекомендували звільнити 30–50 GB перед стартом |
| Учбовий характер | Кожне нетривіальне рішення має коментар «чому»; рішення важливіші за швидкість |

## Технологічний стек

| Шар | Вибір | Версії (з `package.json`) |
|---|---|---|
| Runtime / мова | Node.js, TypeScript, **ESM** (`"type": "module"`, `nodenext`) | TypeScript `^6.0.2` |
| Фреймворк | NestJS | `^12.0.1` |
| Graph DB | Neo4j 5 + Graph Data Science (Community) | образ `neo4j:5`, GDS 2.13.x |
| LLM runner | Ollama | — |
| Chat-модель | `qwen2.5:7b-instruct` | — |
| Embedding-модель | `nomic-embed-text` (768 вимірів) | — |
| Agent framework | LangGraph (low-level `StateGraph`) + `@langchain/ollama` | `@langchain/langgraph ^0.2.74`, `@langchain/core ^0.3.80`, `@langchain/ollama ^0.1.6` |
| Валідація | `class-validator` (DTO), `zod` (вихід LLM) | `zod ^4.6.1` |
| Тести / лінт | Vitest, oxlint, prettier | `vitest ^4.1.2`, `oxlint ^1.58.0` |
| Пакетний менеджер | pnpm | — |

## Структура репозиторію

```
graph-rag/
├── documentation/          ← ця папка
├── graph-rag-api/          ← основний застосунок (git-репозиторій)
│   ├── src/
│   │   ├── main.ts, app.module.ts
│   │   ├── config/         configuration.ts
│   │   ├── common/         parse-json.ts
│   │   ├── llm/            LlmService  (Ollama /api/generate)
│   │   ├── embedding/      EmbeddingService (Ollama /api/embed)
│   │   ├── graph/          GraphService + normalise, describe, lucene, merge-subgraphs, types
│   │   ├── ingest/         controller, service, prompts, dto
│   │   ├── agent/          AgentService (LangGraph), state, prompts
│   │   └── query/          controller, thin QueryService, prompts, dto
│   ├── test/               app.e2e-spec.ts (лише перевірка DI)
│   ├── test-data/          meridian-dynamics.txt + section-1..6.txt
│   └── docker-compose.yml  Neo4j + GDS
└── langgraph-local-test/   ← одноразовий spike: чи працює tool calling через ChatOllama + qwen2.5
```

`graph-rag-api` має власний `.git`; `graph-rag/` і `documentation/` — поза git.

## Як це виглядає в роботі (коротко)

```
POST /ingest { "text": "Maria manages the Platform team. ..." }
   → { "triplesExtracted": 7 }

POST /query { "question": "Who manages the team responsible for billing?" }
   → { "answer": "Maria manages the team responsible for billing.",
       "subgraph": { "nodes": [{"name":"maria"}, ...],
                     "edges": [{"source":"maria","relation":"MANAGES","target":"platform team"}, ...] } }
```

Це перше multi-hop запитання, яке почало працювати (Stage 2, 30 вересня) — з нього проєкт і починали у теорії.
