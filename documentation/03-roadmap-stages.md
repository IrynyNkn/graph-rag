# 03. Драбина Stage 0–6

Драбину запропоновано 8 вересня: кожен щабель **окремо працює й тестується**, plumbing (Neo4j-драйвер, Ollama, REST) однаковий скрізь, а щаблі змінюють переважно **стратегію retrieval**, не переписують систему. Нижче — задум, фактичний стан і те, що відхилилось від задуму.

## Stage 0 — Walking skeleton ✅ (`9966d64`, `e48bb27`, 25 вер)

**Задум:** найтупіший Graph RAG, що вже працює.

- Ingest: текст → 1 LLM-виклик → triples `(subject, relation, object)` → `MERGE` у Neo4j за нормалізованим іменем.
- Query: 1 LLM-виклик витягує сутності з питання → **exact match** за `normaliseName` → 1-hop Cypher → факти в prompt → LLM відповідає.
- Відповідь повертає використаний підграф.

**Стан на 24 вер (перевірка):** backend працював. На 8-нодовому графі:

- «What is Ihor's role?» → «senior engineer», підграф правильний;
- «What is the deadline of project Titan?» → «I don't know» (не вигадала);
- «Who manages the team responsible for billing?» → **не змогла** — Maria на 2 ребра від `billing`, 1-hop не дістає. Це став **готовим тест-кейсом для Stage 2**.

**Що не робилось:** UI; unit-тести; fuzzy match (у задумі було «exact/fuzzy», реалізовано лише exact — свідомо вирішили чекати Stage 1).

## Stage 1 — Embeddings + vector index ✅ (`f7f438f`, 28 вер)

**Задум:** seed nodes за семантичною схожістю, а не точним збігом («ризики білінгу» → нода `billing`).

**Що зроблено:**

- `EmbeddingService` (окремий модуль) — `nomic-embed-text`, з обов'язковими task-префіксами.
- Опис вузла = `name + факти з його ребер`, **побудований кодом**, не LLM (`describe.ts`). Варіант «B» з дискусії.
- Вектор лежить як властивість вузла; `ensureVectorIndex` на старті; `embeddingText`/`embeddingModel` зберігаються поруч.
- Query: LLM витягує **фрази** із запитання → embedQuery кожної → vector search → threshold → seed nodes → `getNeighborhood`.
- Exact match із Stage 0 **замінено**, а не доповнено (лексичного резерву не лишилось — до Stage 3).

**Відомий недолік, залишений свідомо:** `similarityThreshold = 0.6` не відсікає нічого на малому однорідному графі (див. [09](09-empirical-findings.md)). Калібрування відкладене на eval-набір.

## Stage 2 — Personalized PageRank ✅ (`fc37214`, 30 вер)

**Задум:** ядро HippoRAG. PPR від seed nodes → top-N → їхній підграф. Multi-hop працює «як слід».

**Що зроблено:** GDS у `docker-compose.yml`; проєкція `kg`; `personalizedPageRank(seedNames, topN)`; `refreshProjection()` на старті й після кожного ingest; `getNeighborhood` перевикористано над PPR-ранжованими іменами.

**Знахідка по дорозі:** з дефолтною орієнтацією PageRank ходить лише за напрямком збереження ребра → `maria` і `platform team` мали score 0. Фікс — `UNDIRECTED` (деталі в [09](09-empirical-findings.md)).

**Результат:** вперше пройшов flagship-тест — «Who manages the team responsible for billing?» → Maria, через `maria -MANAGES-> platform team -RESPONSIBLE_FOR-> billing`.

## Stage 3 — Якість extraction (частково ✅)

Тут задум розбився на три пункти:

| # | Пункт | Стан | Коміт |
|---|---|---|---|
| 3.1 | **Relation vocabulary** — не вигадувати синоніми (`MANAGES` vs `IS_MANAGER_OF`) | ✅ | `aa5d286` (7 жов) |
| 3.2 | **Entity resolution** на ingest («Acme» vs «Acme Corp») | ✅ | `fc45352` (9 жов) |
| 3.3 | **Provenance** — кожен факт пам'ятає документ/джерело | ⏸ відкладено | — |

### Що змінилось відносно задуму

- Задум казав «закрита схема (`enum`)». На практиці **закритий enum неможливий**, бо словник залежить від завантажених документів. Рішення: **словник, що росте**, береться з самого графа (`MATCH ()-[r:REL]->() RETURN DISTINCT r.type`) і підставляється в промпт перед кожним extraction. Це *soft enforcement* — нові типи не відхиляються.
- Entity resolution зроблено двоступеневим: **кандидати** (vector + fulltext) → **LLM-підтвердження** (fail-closed).

### Чому 3.3 (provenance) відкладено

Рішення 9 жовтня, за ініціативою автора проєкту; прийняте після обговорення:

1. **Інфраструктурний аргумент:** Postgres (для документів/provenance, а далі й користувачів/auth) + RabbitMQ (Stage 6) + SSE — одна хвиля «інфраструктурного гартування», краще робити за один прохід.
2. **Дизайнерський аргумент:** фінальна форма відповіді ще не усталилась — агент (Stage 4) може скласти відповідь з **кількох** tool calls, а Stage 5 додасть community summaries (похідне знання, яке теж потребує provenance). Робити provenance раз, коли форма відповіді стабільна.
3. Технічної залежності між provenance та агентом/global search немає.

Нова послідовність: **Stage 4 → Stage 5 → (provenance + Postgres) разом зі Stage 6.**

Альтернатива, яку розглядали першою: вузол `Document` в тому ж Neo4j (без нової БД). Аргумент (від автора проєкту) за Postgres як таблицю документів: Postgres і так знадобиться для користувачів та auth.

## Stage 4 — Агентний шар ✅ (`7362b9d`, код написано 14 жов, закомічено 3 лис)

**Задум:** retrieval загорнутий у tools + ReAct loop; routing; query decomposition; self-check.

**Що зроблено:** LangGraph `StateGraph` (agent ↔ tools), один tool `local_retrieve`, кастомний state з акумулятором підграфів, `mergeSubgraphs`. `QueryService` став тонким фасадом.

**Що з задуму НЕ зроблено:** routing між кількома стратегіями (є лише один tool), self-check на підкріпленість. Системний промпт містить правило grounding і правило декомпозиції — це все.

**Відхилення від першого рішення:** 9 жовтня було вирішено «лишаємось на ручній реалізації». 12 жовтня від автора проєкту надійшов контраргумент: низькорівневий LangGraph (`StateGraph`) не ховає логіку, а лише прибирає плумбінг, і до того ж це шанс опанувати бібліотеку — рішення змінено на LangGraph. Деталі й спайк — у [05](05-query-and-agent.md) та [08](08-design-decisions.md).

**Стан якості:** працює для baseline, decomposition і негативних запитань; має відтворювані проблеми (порожні відповіді ~20%, over-decomposition, дрейф grounding) — [11](11-known-issues-and-backlog.md).

## Stage 5 — Global-питання ⬜

**Задум:** запитання на кшталт «які основні теми/ризики в усіх документах?» не мають seed nodes, тому PPR вироджується в глобальний PageRank. Microsoft-GraphRAG-підхід:

- community detection (`gds.leiden`) на ingest;
- LLM-summary кожної community;
- map-reduce «global search»;
- другий tool `global_retrieve` для агента + routing.

Зараз для таких запитань у pipeline **немає входу** — агент деградує (наприклад, знайшов 4 з 5 ризиків і вигадав п'ятий).

## Stage 6 — Доводка ⬜

- SSE-стрімінг відповіді;
- фонова черга ingest (RabbitMQ, тиждень 4 refresher-плану);
- **provenance** (разом із Postgres);
- **eval-harness** (Module 7): калібрувальний набір «питання → очікувані вузли», включно з негативними; прогін threshold/topN;
- UX інкрементального оновлення графа;
- **UI**: чат ліворуч, граф праворуч.

## Що можна робити далі (рекомендований порядок)

Не затверджено; це мої висновки з поточного стану:

1. **Стабілізувати Stage 4:** `temperature` + guard на порожню відповідь, правило проти over-decomposition, підсилення grounding на фінальному кроці ([11](11-known-issues-and-backlog.md)).
2. **Eval-harness** — малий набір з [10](10-test-corpus-and-evaluation.md) перетворити на автоматичний прогін. Без нього три «магічні числа» (0.6, 0.5, 15) так і лишаться здогадками.
3. Далі за бажанням: Stage 5 **або** UI (для демонстрації explainability).
