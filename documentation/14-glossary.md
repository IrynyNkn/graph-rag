# 14. Словник термінів

| Термін | Значення в цьому проєкті |
|---|---|
| **RAG** | Retrieval-Augmented Generation: знайти потрібні факти й вставити їх у prompt перед генерацією відповіді |
| **Flat / vector RAG** | RAG, де retrieval — це cosine-пошук по chunks |
| **Graph RAG** | RAG, де знання лежать у knowledge graph, а retrieval — обхід графа |
| **Knowledge graph (KG)** | Вузли (сутності) + ребра (зв'язки) |
| **Entity / вузол** | `(:Entity {name, embedding, …})` |
| **Triple** | Факт `(subject, relation, object)` |
| **Relation / `REL {type}`** | Ребро; смисл у властивості `type`, напр. `MANAGES` |
| **Relation vocabulary** | Множина відомих `type` у графі; підставляється в extraction-prompt, щоб не плодити синоніми |
| **Extraction** | LLM перетворює текст на triples (JSON) |
| **Structured output** | Вихід LLM у фіксованому машиночитному форматі (JSON за схемою), а не прозою |
| **Нормалізація** | `normaliseName` / `normaliseRelation`: регістр, пробіли, `UPPER_SNAKE` |
| **Entity resolution** | Визначити, що два різні написання — це одна сутність («Acme» і «Acme Corp»), і злити; в цьому проєкті: кандидати → LLM-confirm |
| **Fail-closed** | При збої/сумніві поводитись безпечно: у entity resolution = «не те саме» |
| **Embedding** | Вектор (768 вимірів), що кодує зміст тексту |
| **Cosine similarity** | Косинус кута між векторами; −1…1 |
| **Task prefix** | `search_query:` / `search_document:` для `nomic-embed-text` |
| **Anisotropy** | Стиснення embedding-простору у вузький конус → слабка дискримінація |
| **Discrimination (дискримінація)** | Здатність міри відокремити релевантне від нерелевантного (розрив між score) |
| **Vector index** | Neo4j-індекс для швидкого пошуку найближчих векторів (`entity_embedding`, cosine) |
| **Fulltext index / Lucene** | Лексичний індекс по `name` (`entity_name_fulltext`) |
| **Hybrid retrieval** | Поєднання семантичного (vector) і лексичного (BM25/fulltext) пошуку |
| **RRF** | Reciprocal Rank Fusion — спосіб злити два ранжування |
| **Reranking** | Другий, сильніший прохід по малому набору кандидатів |
| **HNSW / ANN** | Наближений пошук сусідів: швидкість коштом гарантії точного top-k |
| **Seed node** | Вузол-вхід у граф: знайдений через vector search по фразі з запитання |
| **PPR (Personalized PageRank)** | Блукання з телепортом назад у seed nodes; score = досяжність від seeds, спадає з відстанню |
| **HippoRAG** | Підхід: PPR над KG; дешевий multi-hop |
| **Microsoft GraphRAG** | Підхід: communities (Leiden) + summaries; сильний на global-питаннях |
| **GDS** | Neo4j Graph Data Science — плагін з графовими алгоритмами |
| **Projection (`kg`)** | In-memory знімок графа для GDS; треба перебудовувати після змін |
| **`orientation: UNDIRECTED`** | Ребра проєкції проходяться в обидва боки; без цього PPR не доходить до «вхідних» сусідів |
| **`topN`** | Скільки вузлів із PPR лишити |
| **Premature pruning** | Відсікати вузол на проміжному hop за нерелевантністю — і втратити шлях до відповіді |
| **Heterogeneity / homogeneity** | Різнорідність / однорідність тем у графі; впливає на розкид cosine-score |
| **Multi-hop** | Відповідь вимагає пройти кілька ребер |
| **Local vs Global search** | Local — від конкретних seed nodes; Global — по всьому корпусу через community summaries |
| **Community / Leiden** | Групи щільно зв'язаних вузлів; алгоритм Leiden (`gds.leiden`) |
| **Agent / agentic** | LLM сама вирішує наступну дію в циклі |
| **Tool / function calling** | Модель повертає структурований виклик `{name, args}` замість тексту |
| **ReAct** | Цикл «думка → дія (tool) → спостереження → знову LLM» до фінальної відповіді |
| **Plan-execute** | Модель одразу планує всі виклики, код їх виконує; без повернення в LLM між кроками |
| **Query decomposition** | Розбити питання на під-питання, по retrieval на кожне |
| **`local_retrieve`** | Єдиний tool: extract phrases → seeds → PPR → neighborhood |
| **LangGraph `StateGraph`** | Граф станів: ноди-функції, ребра-переходи, цикли й умови |
| **`Annotation` / reducer** | Опис поля state і функція злиття нового значення зі старим |
| **`MessagesAnnotation`** | Вбудований state з історією повідомлень |
| **`recursionLimit`** | Ліміт кроків графа (`max_steps`); перевищення → `GraphRecursionError` |
| **`bindTools`** | Прив'язка схем tools до моделі (метадані для неї) |
| **Grounding / abstention** | Відповідати лише з наданих фактів; казати «не знаю», коли фактів нема |
| **Explainability** | Показати, на чому трималась відповідь: `subgraph` |
| **Provenance** | Звідки взявся факт: документ/джерело |
| **Eval-harness** | Набір «питання → очікуване» + автоматичний прогін, метрики recall/precision |
| **Calibration** | Підбір порогів (similarity, topN) на розміченому наборі, а не навмання |
| **Walking skeleton** | Найпростіша наскрізна версія системи, що вже працює (Stage 0) |
| **DAL** | Data Access Layer — `GraphService`; без залежностей на application-сервіси |
| **DTO** | Data Transfer Object — форма HTTP-тіла (`IngestRequestDto`, `QueryRequestDto`) |
| **Spike** | Одноразова перевірка гіпотези поза основним кодом (`langgraph-local-test`) |
