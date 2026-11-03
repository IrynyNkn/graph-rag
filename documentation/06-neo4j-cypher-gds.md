# 06. Neo4j, Cypher, GDS

Код: [`graph.service.ts`](../graph-rag-api/src/graph/graph.service.ts). Це єдиний файл, який говорить із Neo4j.

## Життєвий цикл драйвера

- `onModuleInit` → `neo4j.driver(uri, neo4j.auth.basic(user, password))`, потім `ensureVectorIndex`, `ensureFulltextIndex`, `refreshProjection`.
- `onModuleDestroy` → `driver.close()`. В JS немає деструкторів, а `OnModuleDestroy` — це хук Nest саме для звільнення ресурсів.
- **Чому `onModuleInit`, а не конструктор:** ініціалізація має бути асинхронною (створення індексів, проєкції), а конструктор не може бути `async`. Сам `neo4j.driver(...)` — синхронний, мережеві з'єднання відкриваються ліниво при першій сесії, тож для самого створення драйвера конструктор теж підійшов би; але разом з асинхронними кроками логічно тримати все в одному місці.
- Провайдер у Nest за замовчуванням **singleton** → драйвер один на застосунок (він — пул з'єднань).
- **Одна `session` на операцію**, закривається у `finally`. Session не розрахована на паралельне використання; тримати її довго — витрачати ресурс.
- `executeRead` / `executeWrite` — розділення за семантикою (і для маршрутизації в кластері: читання можна віддати репліці, запис — лише лідеру).
- Усі дані передаються як **bound parameters** (`$name`, `$triples`) — рушій сам парсить запит і вставляє дані, тому немає Cypher-ін'єкцій. Cypher ніколи не будується зі строк від LLM.
- Пакетний запис: один `UNWIND $triples AS t ...` замість циклу з N запитів — менше round-trip'ів, і текст запиту незмінний незалежно від кількості рядків.

## Реєстр запитів

| Константа | Cypher (суть) | Для чого |
|---|---|---|
| `SHOW_VECTOR_INDEX` | `SHOW INDEXES YIELD name,type,options WHERE name=$indexName AND type='VECTOR' RETURN options.indexConfig['vector.dimensions']` | перевірка dimension існуючого індексу |
| `CREATE_VECTOR_INDEX` | `CREATE VECTOR INDEX entity_embedding IF NOT EXISTS FOR (n:Entity) ON (n.embedding) OPTIONS {dimensions, similarity_function:'cosine'}` | |
| `CREATE_FULLTEXT_INDEX` | `CREATE FULLTEXT INDEX entity_name_fulltext IF NOT EXISTS FOR (n:Entity) ON EACH [n.name]` | його вже було створено руками раніше; код теж створює, щоб свіже середовище не залежало від ручного кроку |
| `UPSERT_TRIPLES` | `UNWIND $triples AS t MERGE (s:Entity{name:t.subject}) MERGE (o:Entity{name:t.object}) MERGE (s)-[:REL{type:t.relation}]->(o)` | запис фактів |
| `KNOWN_RELATION_TYPES` | `MATCH ()-[r:REL]->() RETURN DISTINCT r.type` | словник для extraction |
| `NEIGHBOURHOOD` | `UNWIND $names AS name MATCH (e:Entity{name:name}) MATCH (e)-[r:REL]-(:Entity) RETURN DISTINCT startNode(r).name, r.type, endNode(r).name` | 1-hop навколо вузлів, **без стрілки** (ненаправлено); зберігає справжній напрямок у результаті через `startNode/endNode` |
| `UPSERT_EMBEDDING` | `MATCH (e:Entity{name:$name}) SET e.embedding, e.embeddingText, e.embeddingModel` | |
| `GET_EMBEDDING_TEXT` | `MATCH (e:Entity{name:$name}) RETURN e.embeddingText` | контекст кандидата для LLM-confirm |
| `ENTITY_EXISTS` | `MATCH (e:Entity{name:$name}) RETURN count(e) > 0` | short-circuit |
| `FIND_SEED_NODES` | `CALL db.index.vector.queryNodes($indexName,$limit,$vector) YIELD node,score WHERE score >= $threshold` | seed nodes; **поріг у Cypher**, щоб викликач бачив лише тих, хто його пройшов |
| `FIND_CANDIDATES_BY_FULLTEXT` | `CALL db.index.fulltext.queryNodes($indexName,$query,{limit:$limit})` | лексичні кандидати |
| `DROP_PROJECTION` | `CALL gds.graph.drop($projectionName, false)` | `false` = не падати, якщо проєкції ще немає |
| `CREATE_PROJECTION` | `CALL gds.graph.project($projectionName,'Entity',{REL:{orientation:'UNDIRECTED'}})` | |
| `PERSONALIZED_PAGERANK` | `MATCH (n:Entity) WHERE n.name IN $seedNames WITH collect(n) AS sourceNodes CALL gds.pageRank.stream($projectionName,{sourceNodes, dampingFactor, maxIterations}) YIELD nodeId,score WHERE score > 0 RETURN gds.util.asNode(nodeId).name, score ORDER BY score DESC LIMIT $topN` | multi-hop ранжування |

Імена індексів і проєкції — **фіксовані літерали у коді**, а не user input: команди схеми (`CREATE/SHOW/DROP INDEX`) приймають ім'я як синтаксичний ідентифікатор, а не параметр.

## Чому `REL {type}`, а не динамічні типи ребер

У класичному синтаксисі Cypher **ні label, ні тип ребра не можна передати bound parameter-ом**. Усе, що йде від LLM, повинно бути лише *значенням*. Тож усі ребра мають однаковий тип `REL`, а смисл лежить у властивості `type`. Альтернатива (будувати `-[:MANAGES]->` строкою) відкрила б ін'єкцію з виходу LLM. *(Новіші 5.x мають окремий синтаксис динамічних labels/types, але проєкт його не використовує, і з ним ця вимога «лише значення від LLM» ставала б менш очевидною.)*

## Пастки (кожна перевірена живцем)

### 1. `CREATE VECTOR INDEX IF NOT EXISTS` мовчки нічого не робить при іншій dimension

Якщо індекс з таким ім'ям уже є — навіть з **іншою** розмірністю — команда не падає й не міняє його. Це тихий збій: індекс із застарілою dimension не кидає помилку, а просто робить пошук «трохи хибним». Тому `ensureVectorIndex` спершу читає `vector.dimensions` і **відмовляється стартувати** при розбіжності, з повідомленням: скинути індекс → пере-embed усі вузли → перезапустити.

### 2. `neo4j.Integer` ≠ `number`

Значення Neo4j-цілих приходять як `neo4j.Integer`. Порівняння `currentDimension !== dimension` без `.toNumber()` було **завжди `true`**. Тепер код робить `(… as neo4j.Integer).toNumber()`. І навпаки — у запити цілі параметри (`limit`, `dimensions`, `maxIterations`, `topN`) передаються через `neo4j.int(...)`.

### 3. PPR і напрямок ребер

GDS PageRank за замовчуванням іде **лише у збереженому напрямку**. Відношення зберігаються subject→object як витягнуто (`platform team -RESPONSIBLE_FOR-> billing`, `maria -MANAGES-> platform team`). Від seed `billing` вихідного ребра до `platform team` немає — є лише вхідне. З дефолтом `platform team` і `maria` отримували score **0**. `orientation:'UNDIRECTED'` у проєкції вирівнює поведінку з `NEIGHBOURHOOD`, де стрілки в Cypher немає. Це не стилістика, а умова коректності.

### 4. Проєкція — знімок

Disposable in-memory snapshot без persisted-стану, тож drop+create завжди безпечний. Але його треба перебудовувати після зміни графа (`IngestService` це робить) і створювати на старті, щоб `/query` до будь-якого `/ingest` бив у порожню, але існуючу проєкцію, а не в відсутню.

### 5. Масштаб PPR score

Score — це **не** ймовірності, що в сумі дають 1. Спостерігалось: з одним seed сума ≈ 0.96; з 8 seeds сума ≈ 7.69 (≈ кількості seeds). Тобто сума росте приблизно пропорційно кількості seeds, а універсальної стелі «≤ X» немає. *(Висновок із двох реальних замірів, не цитата з документації GDS.)* Мінімум — 0 (вузол недосяжний від жодного seed); тому в запиті `WHERE score > 0`. Від'ємних значень бути не може.

### 6. Фільтр `topN` стоїть після обчислення

`similarityThreshold` фільтрує **вхід** PPR (хто стане `sourceNodes`), `topN` — **вихід**. Якщо поріг пропустив майже весь граф у seeds, personalization вироджується в глобальний PageRank, і `topN` вже нічого не виправить: він лише обрізає вже спотворене ранжування.

### 7. Fulltext: Lucene-спецсимволи

`escapeLuceneQuery` екранує `+ - & | ! ( ) { } [ ] ^ " ~ * ? : \ /`. Рядок приходить у Cypher як bound parameter (безпечно від Cypher-ін'єкції), але **Lucene парсить його вміст** як вираз запиту: ім'я `R&D` або `C++` без екранування ламає парсинг або змінює збіги.

### 8. Fulltext = токенізований збіг, не fuzzy

Знаходить «Acme Corp» за «Acme», бо спільний токен `acme`. Не знаходить опечатки й синоніми. Fuzzy (`~`) на багатослівних іменах незручно будувати — відкладено.

## Корисні ручні запити

Див. [12-runbook.md](12-runbook.md) (очищення графа, лічильники вузлів/ребер, перегляд індексів).
