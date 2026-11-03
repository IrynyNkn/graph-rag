# 10. Тестові корпуси та оцінка

## Корпуси, які використовувались

| Дата | Корпус | Розмір графа | Призначення |
|---|---|---|---|
| вер | Ручні тестові речення (Maria / Platform team / billing / Ihor / Ira / Growth team / Senior engineer / Payments service) | 8 вузлів | Stages 0–2, flagship multi-hop |
| 9 жов | «Acme Corp» / «Acme» / «Acme Industries» | 2–3 вузли | entity resolution: positive та negative |
| 12 жов | 20 малих документів, оргструктура вигаданої компанії (команди, люди, сервіси, проєкти, партнери) | 37 вузлів / 44 ребра / 9 типів relations | живе тестування entity resolution на більшому графі; пастка «Olena» |
| 14 жов | **Meridian Dynamics** — [`test-data/`](../graph-rag-api/test-data/) | 92 вузли / 122 ребра | тестування Stage 4 |

> Для 12-жовтневого корпусу в репозиторії файлів нема (генерувався скриптом у сесії); Meridian лежить у `test-data/` і закомічений.

## Meridian Dynamics

Файли: `meridian-dynamics.txt` (цілий) і `section-1.txt … section-6.txt` (розбиття по секціях для окремих `/ingest`, щоб відповідати принципу «малі документи»).

### Структура вигаданої компанії

| Секція | Підрозділ | Теми |
|---|---|---|
| 1 | **Platform Engineering** (CTO Diana Kessler) | Checkout Team (→ Checkout Service → Billing Engine), Catalog Team, Search Team (→ Search Index → Catalog Service + NimbusCDN; Project Lighthouse; **Key Person Risk**) |
| 2 | **Data Platform** | Analytics Team (→ Analytics Dashboard → Data Warehouse; **Data Latency Risk**), ML Team (Recommendation Engine, ML Training Pipeline; Project Horizon), Data Pipeline Team (→ Data Warehouse → DataVault Analytics) |
| 3 | **Customer Success** (COO Marcus Webb) | Support Team, Onboarding Team (→ Onboarding Portal → Identity and Access Service; Project Compass), Success Engineering Team (→ Customer Health Score; Project Beacon) |
| 4 | **Infrastructure and Security** | Network Team (→ Network Gateway; **Capacity Risk**), Security Team (→ Identity and Access Service → Network Gateway + SecureAuth Inc.; Project Fortress), Cloud Team (→ Cloud Orchestrator → Network Gateway + CloudHarbor Technologies; **Vendor Lock-in Risk**) |
| 5 | **Finance and Operations** | Billing Team (→ Billing Engine → Invoicing Service → PaySecure; **Compliance Audit Risk**; Project Streamline), Procurement Team (oversees TalentBridge, LegalWorks Partners, GlobalShip Logistics), Payroll Team |
| 6 | **Vendor follow-up** | Навмисно **короткі форми** імен, введених повно раніше: CloudHarbor, DataVault, SecureAuth — тест entity resolution |

Навмисні пастки в корпусі: два «Marcus» (Marcus Reyes — Senior Engineer; Marcus Webb — COO); короткі форми вендорів у секції 6.

**Ключові ланцюги для multi-hop:**

- `Checkout Service → Billing Engine → Invoicing Service → PaySecure` (3 hops);
- `Checkout Team → Platform Engineering → Diana Kessler` (CTO);
- `Search Team → Search Index → Catalog Service`.

### Результат vendor-тесту (секція 6)

Пройшов. У графі лишились лише повні форми (`cloudharbor technologies`, `datavault analytics`, `secureauth inc.`); короткі форми не створили дублікатів.

## Набір запитань для Stage 4 і результати (14 жов)

Групування за **агентною поведінкою, що перевіряється**. Як спостерігати: рахувати рядки `local_retrieve("...")` у логу.

| Група | Запитання | Очікування | Фактичний результат |
|---|---|---|---|
| 1 baseline | **1a** «What role does Marcus Reyes have?» | 1× tool | ⚠️ Відповідь правильна («senior engineer»), але підграф **37 вузлів** |
| | **1b** «Who manages the Catalog Team?» | 1× tool | ❌ **порожня відповідь**, tool не викликався |
| 2 multi-hop в одному предметі | **2a** «What does the Checkout Service ultimately depend on?» | 3 hops до PaySecure | ⚠️ зупинилась на Billing Engine — **секції 5 не було в графі** (тест неможливо оцінити чесно); побічно виявлено зворотне дубль-ребро `billing engine DEPENDS_ON checkout service` |
| | **2b** «Who oversees the department that the Checkout Team belongs to?» | → Diana Kessler | ❌ **порожня відповідь** |
| 3 decomposition | **3a** «Compare the risks facing the Search Team and the Cloud Orchestrator.» | 2× tool | ✅ два окремі виклики (`risks facing the Search Team` / `risks facing the Cloud Orchestrator`), ≈2 с між ними, обидва ризики знайдено |
| | **3b** «Compare how the Billing Team and the Security Team are structured.» | 2× tool | ⚠️ відповідь суперечить сама собі; **`Billing Team` у графі відсутня** (секцію 5 не проінджестовано) — тест неповний через дані |
| 4 grounding | **4a** «What is the budget for Project Compass?» | «не знаю» | ✅ без вигадки |
| | **4b** «Who is responsible for the self-driving car division?» | «не знаю» | ✅ без вигадки, навіть коли retrieval притяг нерелевантні вузли |
| 5 over-decomposition | «Who manages the Search Team, what service does that team own, and what does that service depend on?» | **1×** tool | ⚠️ відповідь повна й правильна, але **3 окремі** виклики (50.6 с) |
| 6 query-time short form | **6** «What problems has CloudHarbor had recently?» | знайти `cloudharbor technologies` | ❌ **порожня відповідь** |
| 7 global (свідомо «нечесне») | «What are the main risks across the whole company?» | чесна деградація | ⚠️ знайдено 4 з 5 реальних ризиків, але **вигадано «Support Team Risk»** з обмовкою «While not explicitly stated…» |

Додатково було ще два запуски (ping та «common business risks») — разом 11 прогонів.

### Висновок

- **Працює:** grounding на негативних запитаннях; decomposition на різні предмети (3a).
- **Частково:** розмір підграфа; over-decomposition; дрейф grounding на фінальному синтезі; тести 2a/3b не придатні до оцінки, поки не проінджестовано секцію 5.
- **Не працює:** порожня відповідь у 3 з ~14 рішень моделі (≈ 20%) — 1b, 2b, 6. Дані для цих запитань **у графі є**, тож це збій рішення моделі, а не нестача даних.

Пояснення й гіпотези — [11](11-known-issues-and-backlog.md).

## Набір з 12 жовтня (для малого графа)

Запропоновано, але прогін на 37-нодовому графі не робився, бо граф було оновлено до Meridian:

- baseline: «Who is responsible for billing?» → platform team;
- multi-hop: «Who manages the team responsible for billing?» → Maria (2 hops);
- decomposition: «Compare who manages the Platform team and who manages the Growth team.»;
- негативний: «What is the deadline of project Titan?»;
- adversarial: «What is the capital of France?» — перевірити, що не відповість зі своїх знань без `local_retrieve`;
- 3-частинна декомпозиція: «Compare the managers of the Platform team, the Growth team, and the Sales team.» (Sales не існує → часткове «не знаю»; перевіряє, що `recursionLimit 10` не обриває зарано).

## Як перетворити це на eval-harness (Stage 6)

Формат калібрувального запису (обговорювався 30 вер):

```json
{ "question": "Who is responsible for bills?", "expectedNodes": ["billing"] }
{ "question": "What is the deadline of project Titan?", "expectedNodes": [] }
```

Прогнати pipeline при різних `similarityThreshold` / `topN`, порахувати **recall** (скільки правильних знайдено) і **precision** (скільки сміття протекло), вибрати найкращий баланс. Для агентних сценаріїв додати очікувану **кількість** викликів `local_retrieve` (1b/5 показують, що текст відповіді сам по собі це не доводить).
