# CONTEXT.md — контекст проекта для работы агента

> Файл создан, чтобы новый агент (в т.ч. в ACP-панели VS Code) быстро разобрался в ситуации.
> Читай целиком перед началом работы. Обновляй файл по ходу значимых изменений.

> **ПРАВИЛО ПАМЯТИ (для агента):**
> 1. В начале каждой сессии прочитай CONTEXT.md целиком и продолжай работу оттуда.
> 2. В конце сессии (задача завершена/пользователь уходит) обнови CONTEXT.md: раздел «Что уже
>    сделано (история)» — новое, «Что надо сделать (TODO)» — актуальный остаток, «Важные особенности /
>    ловушки» — новые факты. Затем закоммить и запушь.
> Файл хранится в git ⇒ память общая: другие чаты и коллеги видят то же состояние.
> Промпты для пользователя — в разделе «6. Как начать диалог с агентом».
> Профессиональный промпт (системная инструкция + шаблоны) — в `PROMPT.md` (корень репо).

---

## 1. Что это за проект

**SLA Planner** — веб-портал планирования работ с SLA-контрактами. Сайт работает **только с живыми данными из Zabbix** (через Zabbix API) — мок/seed-данные удалены и запрещены.

Стек:

| Компонент | Технология | Порт | Запуск |
|---|---|---|---|
| Frontend | React + Vite + TypeScript | :3000 | `npm run dev` (vite, proxy `/api` → :8000) |
| Backend | Python + FastAPI + SQLAlchemy (async) | :8000 | `venv/bin/uvicorn app.main:app --reload` (из `sla_planner/backend`) |
| Тестовый Zabbix | Zabbix 7.0 (web :8080, server :10051, postgres) | :8080 | docker stack |
| БД сайта | SQLite | — | `sla_planner/backend/sla_planner.db` |

**URLы:** сайт `http://172.20.189.125:3000` · Zabbix `http://172.20.189.125:8080` · публичный IP `93.157.255.252`

**Окружение:** WSL2 Ubuntu. VS Code подключён через расширение WSL, проект открыт в нём. ACP-панель (`formulahendry.acp-client`) подключает OpenCode (`/usr/local/bin/opencode acp`).

---

## 2. Доступы

- **Сайт (логин/пароль из query params!):**
  `POST /api/auth/login?username=admin&password=admin123` → возвращает `access_token` (не `token`).
  Пользователи: `admin/admin123`, `planner/planner123`, `viewer/viewer123`.
- **Zabbix API:** `http://localhost:8080/api_jsonrpc.php`, Bearer-токен в `.env` (`sla_planner/backend/.env`), пользователь Super admin.
- **Режим записи:** `ZABBIX_READ_ONLY=false` — можно создавать/менять объекты в Zabbix (это тестовый стенд).

---

## 3. Что уже сделано (история)

### Тест для услуги Q3MET ТЭСЦ-1: хосты + триггер «недоступен по пингу» (2026-10-10)

По просьбе пользователя на тестовом Zabbix (`localhost:8080`) для услуги **Q3MET ТЭСЦ-1**
(serviceid=796, корень модели здоровья):
- созданы хосты `q3met-app-01` (10688) и `q3met-app-02` (10689): группа Applications,
  агент-интерфейс на заведомо недоступных TEST-NET IP (192.0.2.1 / 192.0.2.2),
  тег `service: Q3MET ТЭСЦ-1`;
- на каждом хосте item `icmpping[<ip>]` (delay 1m) и триггер **«недоступен по пингу»**
  (severity 4 = High);
- `problem_tags: service=Q3MET ТЭСЦ-1` повешены НЕ на корень (у него есть дети — нельзя),
  а на листовую услугу **798 «Доступность по ping»** (ветка `MES-DB-PROD-TESC1`, 1253).

Проверено end-to-end: item=0 (пинг не идёт), триггеры 25227/25228 в проблеме
(events 30/32, тег `service=Q3MET ТЭСЦ-1`), статус услуги **4 (High)** на листе 798,
MES-DB-PROD-TESC1 и корне 796. Сайт не трогался (хосты на сайт не синкаются).
- **Теги на триггерах (по требованию пользователя):** триггерам 25227/25228 добавлен тег
  `service: Q3MET ТЭСЦ-1` (`trigger.update`, `tags`) — теги открытых проблем обновились сразу
  (в Zabbix 7.0 изменение тегов триггера пересчитывает теги активных событий).
- **Новый скрипт `create_ping_test_hosts.py`** (корень репо): повторяемо создаёт тестовые хосты
  с триггером «недоступен по пингу» **и тегом `service` на триггере**; идемпотентный
  (`--service --prefix --count [--group --base-ip-octet]`), креды из `backend/.env`.
  Проверен путь и создания, и пропуска существующих.

Новые ловушки Zabbix 7.0 (проверено вживую):
- услуга с детьми НЕ может иметь `problem_tags` («cannot have problem tags and children at the same time») — теги проблем вешаются на листовые услуги;
- item `icmpping` БЕЗ параметра падает в unsupported («must have target or host interface specified») даже при наличии агент-интерфейса — задавать цель явно: `icmpping[<ip>]`;
- `service.get` не принимает `selectAncestors` и поле `problem_count`; `selectProblemEvents` — только eventid/severity/name.

### Обслуживание репозитория (2026-10-10) — ЗАКОММИЧЕНО И ЗАПУШЕНО

- **AGENTS.md** переработан ранее (коммит `3e75444`): точные команды typecheck/одиночный тест,
  трап с seed.py, факты про create_all/Alembic, актуальные пути graph-API.
- **Alembic:** добавлена миграция `003_graph_tables` (таблицы `graph_node_positions`,
  `graph_node_styles`); `alembic/env.py` теперь берёт URL из `settings.DATABASE_URL`,
  а не из `alembic.ini`. Проверено upgrade→downgrade→upgrade на чистой БД. Dev-БД помечена
  `alembic stamp head` (была `002`, а таблицы графа уже были созданы `create_all`).
  Запуск миграций — `venv/bin/python -m alembic ...` (консольный `alembic` без `python -m`
  не видит пакет `app`).
- **`app/seed.py`** переписан: идемпотентно заводит ТОЛЬКО пользователей (admin/planner/viewer);
  мок-SLA/услуги/работы/аудиты из него удалены (проверено на изолированной БД: первый запуск
  создаёт, повторный — skip).
- **`fix_tree.py`** (untracked, устаревшая версия переноса) удалён — вместо него `fix_tree_uuid.py`.
- **README.md** актуализирован: 18 тестов, миграции до `003`, routers/models, users-only seed,
  тестовый стенд 67/711, пометка про `stamp head` для существующих БД.
- **AGENTS.md** обновлён под новые факты (seed без моков, миграции 001→003, env.py).
- Проверено: pytest 18/18, `tsc --noEmit` чистый. Живые данные на стенде не менялись
  (67 SLA / 711 услуг в БД сайта сохранены).
- **`origin` переставлен** на новый URL `https://github.com/gusha1gg-lang/SLA-planner.git`
  (старый `prod.git` GitHub перевёл на редирект). Проверено `ls-remote`: ветка на месте.

### Синхронизация Zabbix ↔ сайт (главное изменение) — ЗАКОММИЧЕНО И ЗАПУШЕНО

> Коммиты `3f577ca` (sync) и `c225d54` (docs: CONTEXT.md) запушены в origin
> (`sla-planner-zabbix-integration-ebdcf`). Ветка на сервере и локально синхронизированы.

1. **Backend `app/services/sync.py`** — полностью переписан:
   - `sla_service_tags()` / `sla_tag_values()` — хелперы для тегов;
   - связка SLA↔Услуга по тегам: значение тега услуги `service` ∈ значений `service_tags` SLA (точное совпадение, без учёта регистра);
   - **prune** — удаляет из БД сайта SLA/услуги, пропавшие в Zabbix (+ осиротевшие связи и запланированные работы). Пропускается, если Zabbix вернул пустой список (защита от случайного удаления);
   - `full_sync` — полный синк одной операцией.
2. **`zabbix_client.sla_get()`** — теперь запрашивает `selectServiceTags` (раньше теги не приходили).
3. **Новый роутер `app/routers/sync.py`** → `POST /api/sync/full` (SLAs → services → links за один запрос).
4. **`GET /api/sla/service-links`** — связи SLA↔услуг; пересборка связей в `routers/sla.py` и `routers/services.py`.
5. **`/api/sla/` нормализует `service_tags` к `string[]`** (оригинальный регистр) — фронтенд ожидает массив строк, а не объекты Zabbix.
6. **Frontend:**
   - `src/api/realClient.ts` — реальные `getSLAServiceLinks()` и `syncFull()` (mock-фолбэк только без токена);
   - `src/components/StatusBar.tsx` — кнопка синка вызывает `api.syncFull()`.
7. **Мок-данные стёрты** из `sla_planner.db` (5 SLA, 7 услуг, 7 связей, 3 работы, 5 аудитов удалены). Остались только 3 пользователя + живые данные Zabbix.

### Исправлен баг «Нет услуг для этого SLA»
Причина: API отдавал `service_tags` как объекты Zabbix, а фильтр в форме делал `selectedSla.service_tags?.includes(tag.value)` по строкам. После нормализации к `string[]` услуги появляются в выпадающем списке.

### Создано в Zabbix (живые объекты)
- **Услуги:** `1С` (serviceid=4), `SAP` (serviceid=5), `Test Service 1` (serviceid=3), `СКУД` (serviceid=6), `EWM` (serviceid=7), `MES` (serviceid=8).
  У каждой: тег `service: <имя>` (= что забирает SLA Planner) + `problem_tags: service=<имя>` (= проблемы хостов скатываются в услугу).
- **Хосты:** `1c-app-01`, `1c-db-01` (тег `service: 1С`), `sap-app-01`, `sap-db-01` (тег `service: SAP`).
- **SLA:** `Test SLA v3` (slaid=5, `service_tags: ["Test Service 1"]`), `ERP` (slaid=6, `service_tags: ["СКУД", "EWM", "MES"]`, period=0 / 24x7), `1С` (slaid=7, `service_tags: ["1С"]`, period=0 / 24x7), `SAP` (slaid=8, `service_tags: ["SAP"]`, period=0 / 24x7).
- Важно про Zabbix 7.0: **прямой связи «услуга ↔ хост» в API нет** (нет параметров `hosts`/`selectHosts`). Связь только через теги: хост с тегом → проблема наследует теги → `problem_tags` услуги матчит их.

### Проверено
- Полный синк: `POST /api/sync/full` → `{"slas":4,"services":6,"links":6}`; связи без дублей: Test SLA v3→Test Service 1, ERP→СКУД/EWM/MES, 1С→1С, SAP→SAP.
- Prune работает (фейковые SLA/услуга/связь удалились при синке).
- End-to-end push: работа ERP/1С → push → в Zabbix у ERP (slaid=6) создан `excluded_downtime "SLA Planner #1"`; работа удалена, downtime в Zabbix прибран.
- `npx tsc --noEmit` — чисто. `pytest` — 18/18.
- **Ловушка:** `get_db` коммитит ПОСЛЕ формирования ответа (teardown dependency). Сразу следующий запрос (push/GET) может на доли секунды видеть старое состояние (404 Work not found / висящая удалённая работа) — это гонка, не баг.

### Моки убраны полностью (живые данные только) — не закоммичено
Причина: на сайте «пропадала» услуга 1С. Оказалось, фронтенд имел mock-фолбэк:
при `sla_token='mock-token'/'mock-jwt-token'` в localStorage (сессия от момента, когда
бэкенд был выключен) все страницы отдавали мок-данные (без 1С и без ERP).

Сделано:
- Удалён `src/api/mockData.ts`; `realClient.ts` больше не содержит фолбэков — `api.*` всегда ходит в реальный бэкенд.
- `AuthContext` не логинится в mock; при старте вычищает устаревшие mock-токены (такая сессия → страница логина).
- Новые живые endpoints: `GET/POST /api/sla/{slaid}/excluded-downtimes`, `DELETE /api/sla/{slaid}/excluded-downtimes/{name}` (через Zabbix, роли: POST — admin/planner, DELETE — admin).
- `SLADetailPage`: исключения простоя теперь из Zabbix (были захардкожены); добавление/удаление работают через API.
- `LoginPage`: подсказки реальных паролей (admin123 / planner123 / viewer123).
- Проверено: tsc чистый, pytest 12/12, endpoints: GET→[], POST add→есть, DELETE→[]; viewer на POST = 403, planner на DELETE = 403.

### SLA «1С» — привязка «каждый сервис → свой SLA»
По просьбе пользователя услуга 1С получила собственный SLA «1С» (slaid=7, `service_tags: ["1С"]`),
а из ERP тег `service: 1С` убран (ERP теперь `service_tags: ["SAP"]`). Итог без дублей:
Test SLA v3→Test Service 1, ERP→SAP, «1С»→1С. `sync/full` → `{"slas":3,"services":3,"links":3}`.

### Расширение тестовой модели (СКУД / EWM / MES)
Созданы SLA «SAP» (slaid=8) и услуги `СКУД` (6), `EWM` (7), `MES` (8). ERP переназначен:
`service_tags: ["СКУД", "EWM", "MES"]` (SAP вышел из ERP в свой SLA). Итог:
Test SLA v3→Test Service 1, ERP→СКУД/EWM/MES, «1С»→1С, «SAP»→SAP. `sync/full` → `{"slas":4,"services":6,"links":6}`.

### Фикс: редактирование работы + имя окна в Zabbix = заголовок
Жалоба: «в Zabbix пишется SLA Planner #1, а надо заголовок работы» и «не могу изменить работу (не сохраняется)».
- **Несохранение редактирования:** фронтенд слал `PUT /api/works/{id}`, такого роута на бэкенде не было (405), ошибка молча проглатывалась. Добавлен `PUT /{work_id}` в `app/routers/planned_works.py` (admin/planner; обновляет title/description/sla_id/service_id, пересчитывает `downtime_period_from/to` по новым датам; аудит `update`). В `WorksPage` onSave обёрнут в try/catch с error-тостом (показывает ошибку вместо «висения» формы).
- **Имя окна в Zabbix:** push теперь пишет `name = work.title` (раньше `downtime_marker` = `SLA Planner #<id>`) и перед добавлением удаляет устаревшую запись со старым маркером (идемпотентный re-push). На живых данных: работа «Обновление» → в SLA 1С `excluded_downtime "Обновление"` вместо `SLA Planner #1`.
- **Автосинк правок planned-работ:** `PUT /api/works/{id}` у работы со статусом `planned` теперь сам прокатывает изменения в Zabbix (через `_reconcile_zabbix_window`): удаляет старое окно (старый заголовок + маркер, при переносе на другой SLA — убирает и оттуда) и добавляет новое с актуальным заголовком/периодом. При сбое Zabbix — 502 и rollback (и БД, и Zabbix остаются в старом состоянии). Проверено на живых данных: PUT «Обновление beta» → Zabbix обновился → PUT обратно.
- Тесты: +3 (`test_update_work`, `test_push_uses_work_title_as_downtime_name`, `test_update_planned_work_resyncs_zabbix`) → pytest 15/15, tsc чистый.
- Запушено в origin: `b2b4aa7` (c7ded78..b2b4aa7, 5 коммитов) — по разрешению пользователя «всегда пуш, если считаешь нужным».

### Тестовый Zabbix пересобран с прода: 67 SLA / 711 услуг (реальные данные)
Пользователь перенёс реальную структуру с прод-Zabbix (`zabbix-app-004.d0.vsw.ru`, read-only) на
тестовый (`localhost:8080`) скриптами в корне репо: `import_test.py` (импорт 711 услуг + 67 SLA из
`zabbix_dump.json`, точный матч по UUID), `fix_tree_uuid.py` (дерево через `parents`, 643 связи),
`delete_all_services.py` (чистка перед повторным импортом). `zabbix_dump.json` (1013 КБ, прод-данные)
— в `.gitignore`, лежит локально. Файлы `export_zabbix.py`/`create_slas.py` в репо не копировались.

Итог на тестовом Zabbix: **67 SLA** (service_tags: 210 пар, у 28 SLA есть excluded_downtimes),
**711 услуг** (тег `service`), дерево **643 ребра / 68 корней**. Прода не трогать.

Сайт синхронизирован: `POST /api/sync/full` → `{"slas":67,"services":711,"links":201}`.
Старые мелкие объекты (Test SLA v3/ERP/1С/SAP, услуги 1С/SAP/СКУД/EWM/MES) и работа
«Обновление 12321» (ссылалась на удалённый SLA) прунены — это ожидаемо. Модель БД портала
(67 SLA / 711 услуг с деревом / many-to-many links / live excluded_downtimes) всё это поддерживает.

**Фикс кода (закоммичен):** Zabbix 7.0 **не отдаёт `parent_serviceid`** — иерархия только через
`parents`. `zabbix_client.service_get()` теперь запрашивает `selectParents`, `sync_services` берёт
родителя из `parents[0]["serviceid"]` (раньше дерево на сайте терялось: всё parents=None).
Проверено на живых данных: 643 ребра на сайте, 0 битых ссылок.

### Граф разбит на модели здоровья (деревья услуг) — ЗАКОММИЧЕНО
`GraphPage` больше не рисует все 778 узлов на одном полотне. Сверху — селектор **«Модель здоровья»**
(68 корневых услуг): каждая модель = дерево от корня + SLA, связанные с услугами дерева по тегам.
Корень выделен фиолетовым боксом, потомки — эллипсами, SLA — синими боксами. Списки SLA/услуг снизу
тоже в рамках выбранной модели. **Уровень узла = реальная глубина в дереве (корень=1, дети=2, внуки=3),
а не «корень/не-корень»** — иначе внуки («Доступность БД …») встают в один ряд с родителями («в боку»).
Пустая БД → приглашение нажать «Синхр. с Zabbix».

### Ручная раскладка графа (перетаскивание + закрепление для всех) — ЗАКОММИЧЕНО
- **Backend:** новая таблица `graph_node_positions` (model_key = root zabbix_serviceid, node_key =
  `svc:<zabbix_serviceid>`/`sla:<zabbix_slaid>` — переживают промену id БД, x, y) + роутер
  `app/routers/graph.py`: `GET/PUT/DELETE /api/graph/positions?model=`. PUT/DELETE — только admin, GET — все.
- **Frontend (`GraphPage`):** граф по умолчанию **заморожен** (режим просмотра, узлы не тянутся).
  У admin на каждой модели кнопка **«Редактировать граф»** → включается перемещение узлов;
  **«Сохранить»** — раскладка для всех + снова заморозка, **«Отмена»** — вернуть последнюю
  сохранённую раскладку. **Физика vis-network и её иерархический layout отключены** (первая версия
  на hierarchical+physics не давала перетаскивать узлы) — координаты считаем сами: листья слева
  направо, внутренний узел — по центру детей, SLA-ряд над корнем; позиции заданы явно, поэтому
  drag в режиме редактирования работает сразу и держится. «Сбросить раскладку» (admin) возвращает
  дефолт. Раскладка своя у каждой модели.
  **Драг сделан собственной реализацией:** встроенный vis `dragNodes` выключен; узел ищем самим
  хит-тестом по `getBoundingBox`/`canvasToDOM`, двигаем через `network.moveNode`. Поэтому тянутся
  ВСЕ узлы (в т.ч. эллипсы-услуги — встроенный хит-тест vis их оставлял «замороженными»).
  Потянув услугу, её поддерево едет следом (группа = узел + потомки). В режиме просмотра dragView
  on (пан+зум), в режиме редактирования dragView off (пан выключен, зум колесом работает), клик
  по SLA в режиме редактирования не открывает детали (чтобы не вылетать из редактирования).
  **Ловушка:** у узлов НЕ ставить `fixed: true` — vis-network не двигает fixed-узлы даже при
  `dragNodes: true`. Заморозка даётся через `interaction.dragNodes`/отключённый dragView.
  **Мигание при смене модели:** раскладка защищена полем `savedLayoutModel` (rootId, для которой
  актуальна `savedLayout`) — граф рендерится только с раскладкой текущей модели, иначе успевал
  мелькнуть «дефолт», а потом сохранённое. На время загрузки — спиннер.
- **Цвета узлов (admin):** в шапке графа два пикера — «Цвет SLA» и «Цвет услуг» (общие для ВСЕХ
  моделей). Таблица `graph_node_styles` (node_type `sla`/`service`, color `#RRGGBB`), роутер
  `GET/PUT /api/graph/colors` (PUT — только admin, GET — все). Дефолты: SLA `#3B82F6`, услуги
  `#8B5CF6`. На фронте: `nodeColors` в состоянии; оттенки (тёмнее/светлее) считает функция `shade()`
  (корень услуги — темнее базового, highlight — светлее); перекраска живого графа без пересоздания
  сети — `nodesRef.update({id, color})` + сохранение в БД с debounce 400 мс (`applyNodeColors`).
  Пикеры видны только admin, legend-квадратики используют актуальные цвета.
- Тесты pytest 18/18 (новую таблицу create_all создаёт автоматически), tsc чистый.

### UI: страница переименована «Граф SLA» → «Модель здоровья» — ЗАКОММИЧЕНО
- Меню (`Layout.tsx`), заголовок страницы (`GraphPage.tsx`), роль viewer (`UsersPage.tsx`),
  README — теперь «Модель здоровья». id страницы в меню остался `graph` (роутинг не менялся).

---

## 4. Что надо сделать (TODO)

- [ ] **Новая фича** — пользователь опишет задачу (выбрано в чате 2026-10-10, описание не получено).
- [ ] **Проверить UI вживую** — сессия проверила API-слой (см. ниже), но браузерную проверку
      «Модели здоровья»/работ и граф-редактирования делает пользователь.
- [ ] (low) `sla_planner/frontend/Dockerfile` — docker-путь деплоя требует донастройки (см. README).

---

## 5. Важные особенности / ловушки

1. **Тесты `tests/test_api.py` дропают все таблицы** в той БД, что указана в `DATABASE_URL`! Запускать только на изолированной БД:
   ```bash
   cd sla_planner/backend
   DATABASE_URL=sqlite+aiosqlite:///./test_sla.db venv/bin/python -m pytest
   ```
   (`venv` уже создан, pytest + pytest-asyncio установлены; `/tmp/opencode` root-овский — тестовые БД класть в каталог backend, не туда.)
2. **`test_version` в тестах** проверяет `isinstance(data["zabbix_read_only"], bool)`, а не `is True` — локальный `.env` содержит `false`.
3. **Логин через query params**, токен называется `access_token`.
4. **Prune не срабатывает при пустом ответе Zabbix** — это защита, не баг.
5. **`service_tags` наружу — всегда `string[]`** (нормализация в `routers/sla.py`), внутренне для матчинга — lowercase set.
6. Uvicorn идёт с `--reload` (бэкенд подхватывает правки сам), vite hot-reload тоже.
7. Лог OpenCode: `~/.local/share/opencode/log/opencode.log`.
8. Для ручных вызовов Zabbix API удобно писать скрипты на `venv/bin/python` с `urllib` (примеры были в истории).
9. **Фронтенд без моков:** если в localStorage залёг `mock-token`/`mock-jwt-token`, AuthContext вычистит его при старте — будет страница логина. Без доступного бэкенда сайт не работает (это норма, а не баг).
10. **После перезагрузки машины vite/uvicorn умирают** (docker-Zabbix при этом стартует сам). Поднять: `cd sla_planner/backend && venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &`, в корне репо `npm run dev &`. Логи: `/tmp/opencode/uvicorn.log`, `/tmp/opencode/vite.log`. Проверка: достпно ли `curl localhost:3000` и `curl localhost:8000/health`.
11. **Факты Zabbix 7.0** (проверены на живом 7.0.31): `service.get` НЕ отдаёт `parent_serviceid` — только `parents`/`children` через `selectParents`/`selectChildren`; `service.update` принимает `parents: [{"serviceid":...}]` (массив объектов); `service.create` требует `name`, `algorithm`, `sortorder` (tags опционально), `uuid` задаётся явно; `sla.create` требует name/slo/period/timezone/effective_date/status/service_tags/excluded_downtimes; `sla.update` ПЕРЕЗАПИСЫВАЕТ excluded_downtimes целиком (read-modify-write, учтено в push); значения period_from/to — строки unixtime UTC; авторизация `Authorization: Bearer <token>` (поле `auth` в теле не работает); `apiinfo.version` нельзя вызывать с токеном.
12. **Скрипты переноса (корень репо):** `import_test.py`, `fix_tree_uuid.py`, `delete_all_services.py` — закоммичены. `zabbix_dump.json` в .gitignore. Повторный `import_test.py` создаст дубли — не запускать без `delete_all_services.py`. `fix_tree.py` (старая версия, матч по имени) удалён 2026-10-10 — вместо него `fix_tree_uuid.py`.
13. **Кнопка «Синхр. с Zabbix»** после успешного синка перезагружает страницу (`onSync` → `window.location.reload()` в `App.tsx`) — модель здоровья/списки сразу актуализируются, без ручной смены страницы. Кнопка видна только admin.
14. **По просьбе пользователя БД сайта очищена** (0 SLA / 0 услуг / 0 работ / чистая аудит-лог; пользователи сохранены) — чтобы он лично проверил кнопку синка с пустого состояния. Заполнить заново: у админа нажать «Синхр. с Zabbix» (→ 67 SLA / 711 услуг / 201 связь).
15. **Alembic (с 2026-10-10):** URL берётся из `settings.DATABASE_URL` (не из `alembic.ini`); запуск
    только через `venv/bin/python -m alembic ...` (консольный `alembic` без `python -m` не видит
    пакет `app`). Миграции: `001_initial` → `002_add_service_tags` → `003_graph_tables`. Dev-БД,
    наполненную через `create_all`, пометить `venv/bin/python -m alembic stamp head`, иначе
    `upgrade` упадёт на существующих таблицах. `app/seed.py` — идемпотентный bootstrap только
    пользователей (мок-данных больше нет).
16. **Zabbix 7.0 service/problem_tags/триггеры:** услуга с дочерними услугами НЕ может иметь
    `problem_tags` («cannot have problem tags and children at the same time») — теги проблем
    вешать ТОЛЬКО на листовые услуги (пример: лист 798 «Доступность по ping» в дереве
    Q3MET ТЭСЦ-1). Item `icmpping` без параметра уходит в unsupported — цель задавать
    в ключе: `icmpping[<ip>]`, и в выражении триггера ключ указывать ТОЧНО как у item:
    `last(/host/icmpping[<ip>])=0` (иначе trigger.create: «Incorrect item key»).
    Теги на триггере вешать `tags: [{"tag":"service","value":...}]` — Zabbix сразу
    обновляет теги открытых проблем. `service.get` не поддерживает `selectAncestors`/`problem_count`.

---

## 6. Как начать диалог с агентом

Примеры первого сообщения в ACP-панели VS Code:

- Быстрый старт: **«Прочитай CONTEXT.md и продолжи работу по TODO.»**
- Конкретная задача: **«Прочитай CONTEXT.md, затем закоммить изменения в ветку sla-planner-zabbix-integration-ebdcf с сообщением "sync: full sync endpoint, tag-based links, prune"».**
- Вопрос: **«Прочитай CONTEXT.md. Как в Zabbix 7.0 связать хост с услугой и почему в проекте используется тег service?»**
- Завершение дня (перенос в новый чат): **«Запиши итог сессии в CONTEXT.md и закоммить: что сделано, что осталось, новые факты и ловушки, актуальный TODO.»**

Агент работает в том же каталоге `/opt/sla_planner1` — файлы, git и терминал общие с любой другой сессией. Новый чат АИ не помнит старые — «память» это CONTEXT.md в git: прочитал в начале → продолжил, обновил в конце → зафиксировал для следующего чата.
