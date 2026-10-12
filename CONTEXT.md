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
| БД сайта (dev) | PostgreSQL 16 (docker compose, `postgres:16-alpine`) | :5432 | `docker compose up -d postgres` (из `sla_planner/`) |
| БД тестов | SQLite (`aiosqlite`) | — | тесты сами ставят `DATABASE_URL` |

**URLы:** сайт `http://<server-ip>:3000` · Zabbix `http://<server-ip>:8080` (реальные адреса убраны
из репозитория — см. историю «Секреты вычищены…» и ловушку про opencode.json)

**Окружение:** WSL2 Ubuntu. VS Code подключён через расширение WSL, проект открыт в нём. ACP-панель (`formulahendry.acp-client`) подключает OpenCode (`/usr/local/bin/opencode acp`).

---

## 2. Доступы

- **Сайт (логин/пароль из query params!):**
  `POST /api/auth/login?username=admin&password=admin123` → возвращает `access_token` (не `token`)
  и `user` с полями `role`, `groups`, `permissions`.
  Пользователи: `admin/admin123` (роль `admin` — полные права без групп), `planner/planner123`
  (роль `user`, группа «Планировщики»), `viewer/viewer123` (роль `user`, группа «Наблюдатели»).
- **Zabbix API:** `http://localhost:8080/api_jsonrpc.php`, Bearer-токен в `.env` (`sla_planner/backend/.env`), пользователь Super admin.
- **Режим записи:** `ZABBIX_READ_ONLY=false` — можно создавать/менять объекты в Zabbix (это тестовый стенд).

---

## 3. Что уже сделано (история)

### Синк: bulk-upsert + связи O(N+M) + prune по ключам (2026-10-12)

Пункты 3–5 плана оптимизации синка (см. ловушку №29): `app/services/sync.py` переписан.
Замер на Postgres (живой синк): **было 1.35 c → стало 0.28 c (повторный 0.2 c)**,
данные те же (67 SLA / 711 услуг / 201 связь).

- **3. Bulk-upsert вместо N+1.** `sync_slas`/`sync_services` больше не делают SELECT + INSERT/UPDATE
  на каждый объект. Собираются строки и пишутся порциями по 500 через
  `INSERT ... ON CONFLICT DO UPDATE` — для PostgreSQL `sqlalchemy.dialects.postgresql.insert`,
  для SQLite (тесты) — `sqlalchemy.dialects.sqlite.insert` (выбор по `db.get_bind().dialect.name`).
  `synced_at` в `set_` перебивается на `now()` (ORM-onupdate при bulk-вставке не срабатывает).
- **4. Связи SLA↔услуга за O(N+M).** Вместо вложенных циклов по всем SLA × всем услуг — обратный
  индекс «значение тега `service` (lower) → id услуг»; связи вставляются пачкой.
- **5. Prune без гигантского `NOT IN`.** Существующие ключи вычитываются, старые считаются в Python,
  удаление — порциями по 500 (`PlannedWork`/`SlaServiceLink` перед SLA/Service, как раньше).
  Защита «пустой ответ Zabbix → prune пропущен» сохранена.
- `_service_tag_values` теперь принимает JSON-строку `tags` (а не объект `Service`).
- **Тесты:** новый `tests/test_sync.py` (4 теста: upsert+prune SLA, upsert+prune услуг с родителями
  из `parents[]`, связи case-insensitive, полный синк end-to-end с пруном) — синк раньше был
  вообще не покрыт. Итого pytest **45 passed** (41 + 4).
- Проверено живьём на Postgres: первый синк (вставка), повторный (обновление через
  `ON CONFLICT DO UPDATE`), `synced_at` обновился; API `/api/sla/` и `/api/services/` отдают 67/711.

### Автосинхронизация по расписанию (2026-10-12)

Пункт 1 плана оптимизации — последний из серии. Синк больше не только ручной:
в `app/services/sync.py` живёт планировщик, который поднимается в `lifespan`
(`app/main.py`) и раз в `SYNC_AUTO_INTERVAL_MINUTES` минут запускает тот же
фоновый полный синк (`start_full_sync`) — значит, он делит с ручным запуском лок
(пункт 7) и общий статус (пункт 6), параллельных синков не бывает.
- Конфиг: `SYNC_AUTO_ENABLED` (по умолчанию `true`), `SYNC_AUTO_INTERVAL_MINUTES`
  (по умолчанию `60`; `0` или `ENABLED=false` — выключить). Прокинуто в
  `.env.example` и `docker-compose.yml`.
- `start_auto_sync()` / `stop_auto_sync()`: старт в lifespan, остановка по
  сигналу завершения (задача `_auto_sync_loop` корректно ловит `CancelledError`).
  Тик обёрнут в try/except — планировщик не умирает от единичного сбоя.
- `GET /api/sync/status` теперь несёт блок `scheduler`
  `{enabled, interval_minutes, next_run_at}` (`next_run_at` — UTC через `iso_utc`).
- Фронт: `api.getSyncStatus()` + тип `SyncScheduler`; на «Настройках» (admin)
  под карточкой синхронизации строка «Автосинхронизация: каждые N мин ·
  следующая в ДД.ММ, ЧЧ:ММ» (МСК) либо «Автосинхронизация выключена».
Проверено: pytest **54 passed** (добавлены 3 теста планировщика), typecheck чист;
живьём в логе — «Auto-sync: включён, интервал 60 мин» на старте и «остановлен»
при shutdown, `next_run_at` отдаётся; ui-verify: строка расписания видна у admin
(10 passed, 1 skipped).

### Фоновый запуск полного синка (2026-10-12)

Пункт 6 плана оптимизации. Раньше `POST /api/sync/full` держал HTTP-запрос всё
время синка. Теперь (`app/services/sync.py`, роутер `app/routers/sync.py`):
- `POST /api/sync/full` отвечает мгновенно `202 {"status": "started"}` и запускает
  синк в фоновой asyncio-задаче (`start_full_sync()`); занятый синк → 409.
- `GET /api/sync/status` — статус `idle|running|ok|error|skipped`, времена
  (started_at/finished_at в UTC через `iso_utc`) и `result {slas, services, links}`.
- Фоновая задача открывает СВОЮ сессию (`async_session`) и коммитит сама (`get_db`
  тут не участвует); лок из пункта 7 работает как раньше.
- `_sync_task`/`_sync_status` — на процесс (один воркер uvicorn); ссылка на задачу
  хранится, иначе GC может её собрать.
- Фронт: `api.syncFull()` (realClient) прозрачно поллит `/sync/status` до `ok` (до
  5 мин, шаг 1 с) и возвращает прежние `{slas, services, links}` — StatusBar и
  SettingsPage не менялись; кнопка показывает «Синхронизация…» до завершения.
  Добавлены типы `SyncResult`/`SyncStatus`.
Проверено: POST → 202 за 7 мс, статус → `ok` с 67/711/201; UI-верификация — кнопка
«Синхронизировать» на «Настройках» запускает синк и показывает тост «Синхронизация
завершена: SLA N, услуг M»; pytest **51 passed**; typecheck чист. Заодно ui-verify
перестал быть хрупким: тест MSK-времени при пустом аудит-логе делает skip (свежая БД),
а не падает.

### Лок от параллельных синков (2026-10-12)

Пункт 7 плана оптимизации синка. Раньше повторный клик «Синхр. с Zabbix» или
одновременные вызовы API запускали конкурирующие синки (гонки в prune). Сделано в
`app/services/sync.py`:
- `_sync_lock` — `asyncio.Lock` внутри процесса (у нас один воркер uvicorn).
- `_SYNC_ADVISORY_KEY` + `pg_try_advisory_xact_lock` — НЕблокирующий межпроцессный
  лок для Postgres (страховка на случай `--workers N`); освобождается коммитом/
  откатом транзакции (get_db teardown), явного release не нужно; для SQLite/тестов
  слой пропускается (asyncio.Lock покрывает).
- `sync_lock(db)` — контекст-менеджер: лок занят → `SyncInProgressError` (ОТКАЗ,
  а не ожидание — повторный синк лишь продублировал бы работу).
- Под локом все три сценария: `full_sync` (`/api/sync/full`), `/api/sla/sync`,
  `/api/services/sync` (оборачивают `sync_lock(db)`).
- `SyncInProgressError` → HTTP 409 «Синхронизация уже выполняется» через
  exception-handler в `app/main.py` (не 500).
Проверено: E2E на Postgres — 5 раундов парных `POST /api/sync/full` во всех дали
(200, 409); semantics `pg_try_advisory_xact_lock`: t, пока держит первая сессия,
затем f. Одиночный синк — 200, 67/711/201. pytest **51 passed**
(+`test_sync_full_409_when_already_running`).

### Zabbix-клиент: точечные SLA по id + узкий output (2026-10-12)

Пункт 2 плана оптимизации синка. Разведка на живом тестовом Zabbix 7.0 показала:
`sla.get`/`service.get` **не принимают параметр `offset`** (`Invalid parameter "/":
unexpected parameter "offset"`; у `host.get` offset работает) — классическая
offset-пагинация для этих методов невозможна. Сделано то, что реально сокращает
данные и время (см. `app/services/zabbix_client.py`):
- `sla_get_by_id` — точечный запрос через фильтр `slaids` (раньше выкачивал ВСЕ SLA
  и искал в памяти), полный output + excluded_downtimes для read-modify-write.
- `sla_get`/`service_get` — `output` сужен до полей синка вместо `extend`
  (SLA: slaid/name/slo/period + service_tags; услуги: serviceid/name/algorithm/
  sortorder/status + selectTags/selectParents). Меньше JSON в каждом ответе.
- `sla_get` по умолчанию больше НЕ тянет `excluded_downtimes` (тяжело и в полном синке
  не используется); флаг `select_excluded_downtimes` сохранён для точечных сценариев.
Замер: синк на Postgres **0.24 c** (было 0.28 c после пунктов 3–5; до оптимизаций —
1.35 c), данные 67/711/201; detail-эндпоинт `/api/sla/{id}/excluded-downtimes`
(через sla_get_by_id) — 200. pytest **50 passed** (+5 тестов клиента: параметры
sla_get/service_get, slaids-фильтр, not-found).

### Переезд на PostgreSQL (dev) + миграции как источник истины (2026-10-12)

Решение пользователя: **остаёмся на Postgres** (в проде — БД, а не SQLite). Причина: синк пишет
одной длинной транзакцией, а SQLite — один писатель (риск `database is locked`, N воркеров не
масштабируются); Postgres даёт бэкапы/репликацию. Dev теперь тоже на Postgres; **тесты — по-прежнему
на изолированной SQLite** (переопределяют `DATABASE_URL`, быстрее, ничего не меняем).

- **Postgres поднят из существующего compose:** `postgres:16-alpine`, том `sla_planner_postgres_data`,
  `sla_user/sla_password`, БД `sla_planner`, порт `5432`. Конфликта с Zabbix нет (его `zabbix-db` —
  `postgres:15`, наружу не проброшен). В `docker-compose.yml` сервису `postgres` добавлен
  `restart: unless-stopped` (иначе после ребута машины БД не поднималась) и убран устаревший `version:`.
- **Драйвер:** `asyncpg` установлен в venv и раскомментирован в `requirements.txt`.
  dev `DATABASE_URL` в `sla_planner/backend/.env` → `postgresql+asyncpg://sla_user:sla_password@localhost:5432/sla_planner`
  (`.env` в `.gitignore`, в git не попадает).
- **Миграции как источник истины.** На чистом Postgres прогнаны `001_initial → 005_group_models` —
  все легли, `alembic_version = 005_group_models`. `Dockerfile` теперь перед стартом гоняет
  `python -m alembic upgrade head && uvicorn …` (прольёт схему в проде сам). `init_db()`
  (`create_all`) на старте оставлен dev-удобством.
- **Найден и починен реальный баг Postgres-переносимости:** миграция `005_group_models` ставила
  boolean-дефолт `server_default=sa.text("1")` и делала `UPDATE … SET all_models = 1`. SQLite это
  прощал, **Postgres — нет** (`column "all_models" is of type boolean but expression is of type
  integer`). Исправлено на `sa.true()` и `SET all_models = true`.
- **Данные пересозданы (по решению пользователя):** `app.seed` (пользователи admin/planner/viewer +
  системные группы), затем `POST /api/sync/full` → **`67 SLA / 711 услуг / 201 связь`** за 1.35 c.
  Ручная раскладка графа/цвета из старой SQLite-БД НЕ переносились (осталась резервная копия
  `sla_planner.db` в `/tmp/opencode/db-backup/`, если понадобится достать позиции).
- Проверено: `/health` 200, frontend :3000 200, живой API (`/api/sla/` 67, `/api/services/` 711,
  `/api/groups/` 2, `/api/users/` 3, `/api/graph/colors` дефолтные), браузерный смоук (дашборд +
  «Модель здоровья» отрисовались), **pytest 41 passed** (на SQLite).

### Страница «Настройки» переделана: состояние системы + синк + сводка доступов (2026-10-11)

Пользователь: «Переделай настройки» → затем «часовой пояс мне не нужен, но если его убрать,
настройки будто не нужны — добавь что-то полезное».

- **Убрано редактирование Zabbix из UI.** Раньше `SettingsPage` показывала форму с URL/токеном/
  Read-Only и фейковую «Проверку подключения» (демо-тосты). Реальные значения живут в
  `backend/.env` (`ZABBIX_API_URL`, `ZABBIX_API_TOKEN`, `ZABBIX_READ_ONLY`), бэкенд-эндпоинта
  `/api/settings` нет вообще. Теперь страница только **читает** состояние:
  `/api/version` (версия/бэкенд) и `/api/zabbix/status` (подключение, `api_url`, `read_only`).
- **Убран селектор часового пояса** — он ничего не менял: время жёстко задано MSK в `src/time.ts`
  (`Europe/Moscow`). Вместо него — информационная строка «Время: Москва (МСК, UTC+3)».
- **Добавлен блок «Синхронизация данных»** (admin): кнопка «Синхронизировать» → `POST /api/sync/full`
  (то же, что в `StatusBar`), показывает «Последняя: <МСК-время> · SLA N · услуг M · связей K».
  Результат пишется в `localStorage['sla_last_sync']` — переживает перезагрузку. Проверено вживую:
  `SLA 67 · услуг 711 · связей 201`.
- **Добавлен блок «Доступы»** (admin): счётчики пользователей (и сколько из них админов) и групп,
  плюс пояснение модели прав. Данные — из `GET /api/users` + `GET /api/groups`.
- Каркас: 4 карточки — «Система», «Zabbix», «Доступы» (+ синк внутри «Zabbix»). Роли-гварды
  `isAdmin` сохранены. Typecheck/build/build чистые, pytest 41 passed, проверено Playwright
  (скриншоты `/tmp/opencode/ui-verify/settings*.png`).

### Анимации + единый примитив Button на всех страницах (2026-10-11)

Пользователь: «Добавь анимации и перевести инлайн-кнопки страниц на примитив Button (единые
микро-интеракции)».

- **Примитив `src/components/ui/Button.tsx` расширен:** варианты `primary`/`secondary`/`ghost`/
  `danger`/`success`/`warning`/`danger-soft`; размеры `sm`/`md`; `type="button"` по умолчанию (чтобы
  кнопки в формах случайно не отправляли форму — для отправки явно `type="submit"`); `loading`
  (спиннер+`aria-busy`), `icon`/`iconRight`; кнопка без подписи становится квадратной.
- **Инлайн-кнопки действий переведены на `Button`:** `ConfirmModal` (отмена/подтверждение),
  `SLADetailCard` (добавить исключение, модалка), `SettingsPage`, `UsersPage` (добавить, модалка),
  `GroupsPage` (создать группу, добавить/отмена участника, модалка), `WorksPage` (создать работу,
  модалка), `ReportPage` (экспорт CSV, `success`), `SLADetailPage` (назад, `ghost`), `GraphPage`
  (сохранить раскладку — `success`, отмена — `secondary`, редактировать — `primary`, сбросить —
  `danger-soft`); всё `size="sm"` в графе. Специализированные кнопки (чипы-фильтры, табы, иконки
  строк таблиц, тумблер вида, синк в `StatusBar`) намеренно НЕ переводились, но им добавлен
  `transition-colors` для плавности.
- **Анимации** (`src/index.css`): новые `scale-in` (панель модалки) и `overlay-in` (затемнение);
  утилита `.stagger > *` — каскадное появление детей (дашборд-статистика, список SLA, сводка отчёта).
  Контент в `Layout` получил `key={currentPage}` + `animate-fade-in-up`: при смене страницы контент
  появляется заново (раньше анимация срабатывала только один раз при монтировании).
- **Анимации усилены по просьбе пользователя** («не вижу их»): сдвиг появления `6px → 12px`,
  длительности `0.32→0.4s` (страница), `0.2→0.26s` (модалка); подъём кнопок при hover `1px → 2px`
  и «вжатие» `active:scale-[0.97]`; кликабельные SLA-карточки на дашборде приподнимаются при
  наведении. Проверка `getAnimations()` в живом браузере: `fade-in-up 400ms`, `scale-in 260ms`,
  `overlay-in 220ms` — идут (`prefers-reduced-motion=false`); демо-видео —
  `/tmp/opencode/ui-verify/anim/*.webm`.
- **Пропущенные палитры кодмода:** `purple-*`/`emerald-*` добавлены как токены — `tag-fg`/`tag-soft`
  (метки/тег `service`) и `ok-soft`/`ok-fg` (`emerald-50/700` в «Группах»). Светлый `tag-fg` затемнён
  до `#6d28d9` (контраст ≥ 4.5 на `#f3e8ff`).
- Проверено: typecheck чист; `npm run build` зелёный; pytest 41 passed; Playwright **10 passed**
  (добавлены тесты «Кнопки: единый примитив Button» и «Анимации: модалка и карточки дашборда»).

### Тёмная/светлая тема + раскатка токенов на все страницы (2026-10-11)

Пользователь выбрал из п.3 «тёмная/светлая тема с переключателем» и попросил раскатать пилотный
стиль на контентные страницы (дашборд, работы, отчёт, аудит, пользователи, группы, настройки,
«Модель здоровья»).

- **Семантические токены вместо «голых» цветов.** В `src/index.css` (`@theme`) добавлены токены:
  поверхности `canvas`/`surface`/`surface-2`, границы `line`/`line-strong`, текст
  `content`/`muted`/`faint`, акцент `accent`/`accent-soft`/`accent-line`, статусы
  `ok`/`warn`/`danger` (мягкий фон `*-soft`, текст `*-fg`, граница `*-line`). Блок `.dark`
  (вне `@layer` — нелейерные стили приоритетнее theme-слоя Tailwind) задаёт тёмные значения;
  `@custom-variant dark (&:where(.dark, .dark *))` — чтобы работал и `dark:`-вариант.
- **Кодмод** (`/tmp/opencode/codemod2.mjs`) механически перевёл ~700 классов по всем страницам и
  компонентам: `bg-white`→`bg-surface`, `text-gray-*`→`text-content/muted/faint`,
  `border-gray-*`→`border-line(-strong)`, `bg-gray-*`→`surface-2/line`, статусные
  `bg-green-100`→`bg-ok-soft`, `text-red-700`→`text-danger-fg` и т.п. Слайты в тёмной панели
  сайдбара и логина НЕ трогались (эти блоки всегда тёмные). Тени `shadow-sm`→`shadow-card`.
- **Тема с переключателем.** `src/context/ThemeContext.tsx` (`ThemeProvider`/`useTheme`, ключ
  `sla_theme` в localStorage, класс `.dark` на `<html>`), кнопка `src/components/ThemeToggle.tsx`
  (Lucide Sun/Moon; в сайдбаре — variant `sidebar`, на логине — в правом верхнем углу, на страницах —
  рядом с выходом). Чтобы не было вспышки светлой темы при reload, в `<head>` `index.html` добавлен
  инлайн-скрипт, который до бандла ставит `.dark` из localStorage. `html.dark{color-scheme:dark}` —
  нативные контролы (select/скроллбар) в тёмном.
- Проверено: typecheck чист; `npm run build` зелёный; pytest 41 passed; Playwright **8 passed**
  (добавлен тест «Тема: переключение light/dark и сохранение после F5»). Отдельно прогнан
  контраст-аудит тёмной темы по 8 страницам (WCAG-контраст текста, 0 элементов < 2.5) и сняты
  скриншоты light/dark — `/tmp/opencode/ui-verify/theme/*.png`.

### Визуал: офлайн-иконки/шрифт + бренд-акцент, пилот (логин, сайдбар, кнопки) (2026-10-10)

Пользователь: сайт корпоративный для ОМК-ИТ, нужен сдержанный стиль («не радужно») с приятными
микро-интеракциями; иконки/картинки из интернета брать нельзя — сервер переедет в доменную подсеть.

- **Убрана единственная внешняя зависимость фронтенда.** В `index.html` Font Awesome грузился с
  `cdnjs.cloudflare.com` — в закрытом контуре иконки бы пропали. CDN-`<link>` удалён; **все ~90
  иконок переведены на `lucide-react`** (SVG, вкомпилированы в бандл; пакет уже был в зависимостях,
  но не использовался). Основная замена — кодмод (`/tmp/opencode/codemod-icons.mjs`): статические
  `<i className="fas fa-x">` → компоненты lucide; «динамические» места (карты иконок в
  `ToastContext`/`ConfirmModal`/`AuditPage`, ternary в `UsersPage`, `navigation.ts`, `ModelTree`,
  `StatusBar`) поправлены руками. Конфликты имён обойдены алиасами (`Network as NetworkIcon` в
  `GraphPage`, `User as UserIcon` в `UsersPage`).
- **Шрифт Inter теперь self-hosted** — `@fontsource/inter` (400/500/600/700) импортируется в
  `src/main.tsx`; до этого в CSS был объявлен `'Inter'`, но сам шрифт ниоткуда не грузился.
- **Дизайн-токены** в `src/index.css` (`@theme` Tailwind v4): сдержанный фирменный синий `brand-*`
  (50–950), поверхности `canvas`/`surface`/`line`, мягкие тени `shadow-card`/`shadow-card-hover`,
  `ease-standard`; базовый слой (фон, кольцо фокуса `:focus-visible`), `prefers-reduced-motion`,
  скроллбар в тон, анимации `fade-in`/`fade-in-up`/`slide-in`.
- **Единый акцент по всему приложению:** `blue-*` → `brand-*` (механическая замена классов), чтобы
  оболочка и контентные страницы не расходились по цвету.
- **Пилот редизайна:** `Layout` (графитовый сайдбар: бренд-марка, активный пункт с акцентной
  полосой и hover, карточка пользователя), `LoginPage` (сплит-экран: брендовая панель с инлайн
  grid-паттерном + форма), новые примитивы `src/components/ui/Button.tsx` (варианты
  primary/secondary/ghost/danger, `loading`, иконки) и `src/lib/cn.ts`; подтянуты `StatusBar` и
  `Pagination`. Микро-интеракции: подсветка + `-translate-y-px` на hover, «вжатие» на active,
  кольцо фокуса; длительность 120–200 мс.
- **Логотип** — инлайн-SVG `src/components/BrandMark.tsx` (шестиугольник-«узел»), без внешних файлов.
- Проверено: typecheck чист; `npm run build` зелёный (Inter в бандле); pytest 41 passed; Playwright
  E2E 7 passed; скриншоты — `/tmp/opencode/ui-verify/login-new.png`, `dashboard-new.png`, `graph-new.png`.

### Группы назначаются только на странице «Группы» (2026-10-10)

Пользователь: «при создании пользователя убрать функционал назначения на группы, так как в
группах мы уже назначаем».
- **`UsersPage`:** из формы создания/редактирования убраны чекбоксы выбора групп (и загрузка
  списка групп `api.getGroups()`). Остались имя/пароль/роль/активность; при редактировании
  `group_ids` больше НЕ отправляется — бэкенд (`PUT /api/users/{id}`) при отсутствии
  `group_ids` не трогает членство (`_set_user_groups`: `group_ids is None` → return).
- Вместо чекбоксов — подсказка «Состав групп задаётся на странице «Группы»…». Новый
  пользователь создаётся без групп; админ добавляет его в группы на «Группах».
- Типы клиента `createUser`/`updateUser` в `src/api/realClient.ts` больше не содержат `group_ids`.
- **Бэкенд не менялся:** `POST/PUT /api/users` по-прежнему принимают `group_ids` (используются
  в тестах `test_api.py`); основной путь членства — группы (`/api/groups`, `member_ids`).
- Проверено: typecheck чист; pytest 41 passed; Playwright E2E 7 passed — новый тест
  «Пользователи: при создании нет выбора групп (группы — только на странице «Группы»)».

### Навигация в URL (hash): F5/закладки/«назад-вперёд» остаются на странице (2026-10-10)

Пользователь жаловался: при F5 на «Модели здоровья» сайт сбрасывал на дашборд (навигация
была только в React-состоянии `currentPage`, при перезагрузке — `'dashboard'`).
- **Маршрут переехал в hash URL:** `#/graph`, `#/works`, `#/sla-detail?id=798`. Новый модуль
  `src/navigation.ts`: единый список `NAV_ITEMS` (используется и в `Layout`, и для проверки
  доступа), `readRoute()`/`buildHash()`, `isPageAllowed(page, can, isAdmin)`.
- **`App.tsx`:** состояние — `route` из `readRoute()`; `navigateTo` пишет hash; слушатель
  `hashchange` синхронизирует состояние (кнопки браузера, ручная правка hash); эффект-гвард
  не пускает на страницу без права (откат на дашборд) — например, viewer по закладке `#/users`;
  при выходе маршрут сбрасывается на дашборд.
- **`Layout.tsx`:** определение меню берётся из `NAV_ITEMS` (дублирование убрано).
- **Выбранная модель здоровья тоже переживает F5:** `GraphPage` принимает `initialModelId`
  (из URL `#/graph?model=<rootId>`) и `onModelChange`; выбор хранится в `localStorage`
  (`sla_graph_model`) и отражается в URL (через `history.replaceState` — без нового шага
  истории). Приоритет: URL → `localStorage` → первая доступная модель. Раньше при F5 граф
  всегда открывал самую верхнюю модель из списка.
- Побочный плюс: кнопка «Синхр. с Zabbix» (admin) делает `window.location.reload()` — теперь
  после синка остаёшься на той же странице и модели, а не на дашборде.
- Проверено: typecheck чист; Playwright E2E 6 passed — новые тесты «Навигация: F5 и закладка
  сохраняют текущую страницу» (F5 на `#/graph`, закладка `#/works`, «назад»), «Навигация:
  закладка на чужую страницу не открывается (viewer → дашборд)» и «Модель здоровья: выбранная
  модель переживает F5». Тест времени сделан детерминированным (сверка строки UI с ISO-моментом
  из API, а не с «текущим временем» — login в аудит-лог не пишется).

### Единое время: API отдаёт UTC с зоной, UI показывает МСК (2026-10-10)

Пользователь создал пользователя и вошёл «в 18:37», хотя по МСК было 21:38 — сайт показывал
время на 3 часа назад. Причина: SQLite не хранит часовой пояс, `DateTime(timezone=True)` +
`server_default=func.now()` возвращали *naive*-UTC, а роутеры отдавали `.isoformat()` **без зоны**.
Браузер трактует строку без зоны как локальное время → сдвиг на смещение зоны (для МСК −3 ч).
- **Бэкенд:** новый `app/timeutil.py`: `iso_utc(dt)` (naive считает UTC, добавляет `+00:00`;
  aware приводит к UTC) и `parse_utc(s)` (ISO → aware-UTC, `Z`/смещения, naive = UTC).
  Все эндпоинты, отдающие время (`audit`, `groups`, `users`, `sla`, `services`, `planned_works`),
  переведены на `iso_utc`; создание/правка работы хранит момент через `parse_utc`
  (в SQLite пишется UTC-wall, epoch для Zabbix считается по UTC — корректно).
- **Фронтенд:** новый `src/time.ts` — единые хелперы, отформатированные через
  `Intl` с `timeZone: 'Europe/Moscow'` (детерминированно по МСК независимо от зоны браузера):
  `formatDateTime`, `formatDateTimeShort`, `formatDate`, `formatTime`, `mskDateKey`,
  `toMskInputValue`, `mskInputToDate`. Переведены `AuditPage`, `UsersPage`, `DashboardPage`,
  `WorksPage` (список + календарь + форма), `ReportPage`, `SLADetailCard`, `ServiceConfigCard`,
  `StatusBar`. В форме работы подписи «(UTC)» → «(МСК)», значения полей читаются/пишутся как МСК.
- Проверено: pytest 41 passed (добавлены `test_iso_utc_marks_naive_as_utc`,
  `test_parse_utc_normalizes_offset`, `test_work_timestamps_are_utc`,
  `test_audit_and_user_timestamps_are_utc`), typecheck чист, Playwright E2E 3 passed
  (новый тест «Время: аудит-лог показывает московское время (MSK)»: время первой записи
  совпадает с текущим МСК ±5 мин).

### Скрыта привязка к Zabbix от обычных пользователей; синк — только admin (2026-10-10)

Пользователь просил, чтобы коллеги видели просто сайт плановых работ/отчётов без следов
интеграции с Zabbix, а кнопка синхронизации была только у admin.
- **Кнопка «Синхр. с Zabbix»** и статус `Zabbix`/`Read-Only` в `StatusBar.tsx` показываются
  только при `isAdmin` (обычным — лишь «Сервер: Online» и версия); запрос `/api/zabbix/status`
  для неадмина тоже не делается.
- **`sync.run` убран из каталога прав групп** (`app/permissions.py` `ALL_PERMISSIONS`,
  `src/permissions.ts` `PERMISSION_SECTIONS`): синхронизация стала чисто админ-операцией.
  Роутеры `/api/sync`, `/api/sla/sync`, `/api/services/sync` по-прежнему используют
  `require_permission(P_SYNC)`, но admin проходит по роли; константа `P_SYNC` оставлена только
  для гварда.
- **Убраны пользовательские упоминания Zabbix:** подзаголовок «Модели здоровья» и подсказка про
  синк (только admin) в `GraphPage`; «Загрузка конфигурации…» и «только чтение» в
  `ServiceConfigCard`; «ID SLA»/«ID» в `SLADetailCard`; статус «Ошибка отправки» и кнопка
  «Отправить» вместо «Push»/«Отправить в Zabbix» в `WorksPage`/`DashboardPage`; пустое
  состояние групп. Раздел «Настройки» — по-прежнему только admin, но теперь это не форма
  подключения к Zabbix, а сводка состояния (система, Zabbix, синк, доступы).
- **GroupsPage** при открытии группы отбрасывает права, которых нет в каталоге, — осиротевший
  `sync.run` не улетает в PUT и не ломает валидатор.
- Проверки: typecheck чист, pytest **37 passed**, E2E — `viewer` не видит «Zabbix»/«Read-Only»/
  кнопки синка, `admin` видит.

### Модель прав «как в Grafana»: роли + группы (2026-10-10)

Переделана модель прав: вместо трёх ролей `admin/planner/viewer` — две роли и группы.
- **`admin`** — полные права всегда, без групп (управление пользователями/группами/настройками
  тоже только у admin).
- **`user`** — права = **сумма прав групп**, в которых состоит (несколько групп объединяются).
- **Группа** — это набор прав («что видеть и делать») + состав участников.
- Каталог прав (`app/permissions.py` ↔ `src/permissions.ts`) — «страницы + действия»:
  страницы `dashboard, model, works, reports, audit`; действия `works.edit, works.delete,
  sla.edit, graph.edit`. Полная синхронизация (`sync.run`) — **не право группы, только admin**.
- Новые файлы: бэкенд `app/permissions.py`, `app/deps.py` (get_current_user вынесен сюда, чтобы
  избежать цикла auth↔permissions), `app/models/group.py` (`Group`, `UserGroup`),
  `app/routers/groups.py` (`/api/groups` CRUD, admin-only), миграция `alembic/versions/004_groups.py`;
  фронтенд `src/permissions.ts`, `src/pages/GroupsPage.tsx`.
- Гейтинг на бэке: `require_admin` и `require_permission(...)` (admin проходит всегда). Роутеры
  graph/sync/sla/services/planned_works/audit/users переведены на них; `GET /api/sla/`,
  `/api/services/`, `/api/works/`, `/api/sla/service-links` остаются доступны любому
  авторизованному (общие данные нескольких страниц; видимость страницы — через меню).
- Логин и `GET /api/auth/me` теперь возвращают `user: {id, username, role, groups, permissions,
  is_active}`; фронтенд хранит `permissions` и решает через `can(permission)` (вместо `hasRole`).
- `seed.py` создаёт системные группы «Планировщики» (dashboard/model/works/reports/works.edit/
  sla.edit) и «Наблюдатели» (dashboard/model/works/reports), конвертирует `planner → user +
  «Планировщики»`, `viewer → user + «Наблюдатели»`; пароли не меняются. Идемпотентно.
- Проверено вживую: smoke API по трём логинам (admin — всё; planner/viewer — без audit/users/groups)
  + Playwright E2E (в `ui-check.spec.ts` добавлен тест «Права: меню по правам групп + страница
  «Группы» у admin»): viewer не видит админ-пункты и видит свою группу; admin заходит в «Группы»,
  видит системные группы. Скриншоты: `/tmp/opencode/ui-verify/model-health.png`, `groups.png`.
- pytest 29 passed, typecheck чистый. — ЗАКОММИЧЕНО

### Область моделей здоровья у групп («SAP видит только SAP») (2026-10-10)

Развитие RBAC: группа теперь задаёт не только права, но и **какие модели здоровья** видят
её участники. Пользователи права не получают напрямую — только роль и членство в группах.
- **Модель данных:** `Group.all_models` (Boolean, default True) + `Group.model_ids` (JSON-список
  root-id моделей = `zabbix_serviceid` корня дерева). Миграция `alembic/versions/005_group_models.py`
  (идемпотентна; существующие группы переводятся в `all_models=1` — никто не теряет доступ).
- **Эффективная область** (`app/permissions.py`): `model_scope` (union по группам; admin → все),
  `allowed_service_ids` (корень + все потомки по дереву услуг; `None` = все),
  `can_access_model`, `can_edit_model`. Логин/`/me` возвращают `user.models = {all, ids}`.
- **Право действия привязано к моделям группы:** `graph.edit` из группы действует только на
  модели этой группы (`can_edit_model`). Так «Планировщики»/«Наблюдатели» (all_models) правят
  как раньше, а группа практики (например SAP) — только свою модель.
- **Бэкенд-фильтрация:** `GET /api/services/` отдаёт только услуги доступных моделей;
  `GET /api/graph/positions?model=` и `PUT/DELETE` — 403 на чужую модель;
  `GET /api/services/{id}/config` — 403, если услуга вне области. Комбинируется с `require_permission`.
- **Фронтенд:** `src/healthModels.ts` (`buildHealthModels` — общий сборщик моделей для GraphPage и
  GroupsPage); `AuthContext.canModel(rootId)`; `GraphPage` фильтрует селектор моделей и показывает
  «Нет доступных моделей здоровья», если группа ничего не дала; `GroupsPage` — в стиле Grafana:
  название группы кликабельно (редактирование), «Модели здоровья» вертикальным списком, участники —
  списком с кнопкой «+ Добавить участника» (выбор пользователя из выпадающего списка, удаление — ✕).
- **Seed:** системные группы «Планировщики»/«Наблюдатели» создаются с `all_models=True`.
- **Проверка:** pytest 37 passed (добавлены тесты области: `/me`, фильтр `/api/services/`, 403 на
  чужую модель в positions/config и на редактирование, CRUD с `model_ids`), typecheck чистый,
  живой smoke (`/tmp/opencode/model_scope_smoke.py`: группа SAP → 13 услуг модели 796, чужая
  модель 760 → 403) и Playwright E2E (модалка группы показывает «Все модели здоровья»).
- **TODO:** дашборд/отчёты/работы пока не фильтруются по моделям (scope применён к «Модели
  здоровья» и услугам). При необходимости расширить теми же `allowed_service_ids`/`model_scope`.

### Навыки (skills) для агента (2026-10-10)

По просьбе пользователя созданы проектные skills в `.opencode/skills/` (подхватываются opencode
автоматически, закоммичены в репозиторий):
- **dev-env-up** — идемпотентный подъём dev-среды после ребута (uvicorn + vite, проверка портов,
  логи; скрипт `scripts/env-up.sh`), ловушки про порты и устаревший код vite.
- **zabbix-api** — факты Zabbix 7.0 API (Bearer, parents/children, problem_tags только на листьях,
  icmpping[<ip>], привязка хостов тегом service и т.д.) + готовый клиент
  `scripts/zabbix_client.py` (creds из env/.env, вызовы service/host/trigger).
- **check-secrets** — сканер staged-изменений перед коммитом (`scripts/scan-secrets.sh`):
  паттерны ключей/токенов + запрет на стейдж `.env`, `opencode.json`, `zabbix_dump.json`
  (профилактика повторения инцидента с утёкшим API-ключом). Файлы `*.example`
  (в первую очередь `.env.example` с плейсхолдерами) не сканируются на паттерны — их
  по правилам проекта коммитим; правка 2026-10-12 (раньше `ZABBIX_API_TOKEN=your-…`
  давал ложное срабатывание).
- **ui-verify** — Playwright E2E реального UI (`scripts/ui-check.spec.ts`): логин viewer →
  «Модель здоровья» → граф (canvas) → дерево → клик по узлу → детали, скриншот в
  `/tmp/opencode/ui-verify/model-health.png`; запуск `npx playwright test
  .opencode/skills/ui-verify/scripts/ui-check.spec.ts`. `@playwright/test` — devDependency
  (лёгкий, влить в typecheck нельзя — это отдельный раннер). Браузеры — в кэш пользователя.
- **dod** — чек-лист сдачи (`scripts/dod.sh`): typecheck + pytest на `test_sla.db` + сканер
  секретов + git status, стоп на первом падении.

### Секреты вычищены из репозитория (2026-10-10)

- **`opencode.json` (конфиг MCP opencode) удалён из git и из всей истории** — в нём лежал живой
  API-ключ TestSprite (`sk-member-…`). История ветки переписана (`git filter-branch`), ветка
  перезапушена force-push'ем. Файл теперь в `.gitignore` и живёт только локально (нужен для MCP).
- **Ключ TestSprite переведён на env-переменную**: в локальном `opencode.json` указано
  `{"API_KEY": "{env:TESTSprite_API_KEY}"}` — задать `TESTSprite_API_KEY` в окружении перед
  запуском opencode. Старый опубликованный ключ пользователь должен ОТОЗВАТЬ/перевыпустить
  в кабинете TestSprite (он был виден в открытом репо, пусть и недолго).
- **Ключ перевыпущен и применён (2026-10-10):** `TESTSprite_API_KEY` прописан в `~/.bashrc`
  (в git не попадает), сервис opencode перезапущен — MCP TestSprite авторизован (проверено:
  аккаунт Gusha GG, Free-план, 149 кредитов). После ребута машины сервис opencode стартует
  с переменной из bashrc автоматически. Если в новой сессии testsprite отвечает
  «No API Key» — проверить, что сервис запущен из окружения с переменной
  (`source ~/.bashrc && opencode service restart`).
- **IP машины убраны из CONTEXT.md** (публичный 93.157.255.252 и внутренний 172.20.189.125),
  чтобы не светить адреса в открытом репозитории.
- Проверка: `git log <ветка> -S "sk-member"` → пусто; в истории нет ни одного трекаемого `.env`
  (только плейсхолдеры `.env.example`).

### Тестовые хосты модели Q3MET ТЭСЦ-1 приведены к реальным именам и привязаны (2026-10-10)

По просьбе пользователя вместо `q3met-app-01/02` в тестовом Zabbix теперь три хоста, привязанных
к веткам модели Q3MET ТЭСЦ-1 (корень 796) через тег `service` на хосте и триггере + `problem_tags`
на листовой услуге «Доступность по ping»:

| Хост | IP (TEST-NET) | Ветка модели | Лист «Доступность по ping» |
|---|---|---|---|
| MES-COM-PROD | 192.0.2.1 | 808 | 809 |
| MDB | 192.0.2.2 | 776 | 778 |
| MES-DB-PROD-TESC1 | 192.0.2.3 | 1253 | 798 |

- У каждого хоста item `icmpping[<ip>]` и триггер «недоступен по пингу» (prio 4) с тегом
  `service: <имя>`; у листовых услуг `problem_tags` `service: <имя>` (operator 0). Привязка по
  тегам работает так же, как раньше у листа 798 (тег был `Q3MET ТЭСЦ-1`, теперь у каждого листа
  свой). Модель покажет проблему по всем трём веткам (TEST-NET не пингуется) — это ожидаемо.
- Новый идемпотентный скрипт **`setup_q3met_test_hosts.py`** (корень репо): переименовывает
  старые хосты / создаёт недостающие, доводит item/триггер/теги/problem_tags до нужного
  состояния. Запуск: `python3 setup_q3met_test_hosts.py`.
- Старые имена `q3met-app-01/02` в Zabbix больше не существуют.

### Дерево структуры модели перенесено на «Модель здоровья», вкладка «Услуги» удалена (2026-10-10)

По просьбе пользователя:
- **Новый компонент `src/components/ModelTree.tsx`** — дерево модели (услуги Zabbix) справа от
  графа: сворачиваемые узлы (шевроны), линии-связи (border-l), цветные точки статусов
  (statusColor из ServiceConfigCard), корень выделен жирным; клик по узлу → `selectServiceByZid`
  (подсветка узла на графе + конфигурация под графом). Раскладка страницы — grid
  `lg:grid-cols-[minmax(0,1fr)_340px]`: граф слева, панель «Структура модели» (340px, своя
  прокрутка, высота = 600px) справа; панель деталей осталась под всей строкой.
- **Вкладка «Услуги» удалена** (пользователь: «по логике теперь не нужна»): пункт меню
  (`Layout.tsx`), роут (`App.tsx`) и файл `src/pages/ServicesPage.tsx` удалены. `ServiceConfigCard`
  осталась и используется под графом, endpoint `GET /api/services/{id}/config` жив.
- README обновлён. Проверено: `tsc --noEmit` чистый, `vite build` OK, pytest 20/20.

### Code-splitting: страницы грузятся лениво, первая загрузка легче (2026-10-10)

По просьбе пользователя (опасение «всё на одной странице → будет лагать») страницы переведены
на `React.lazy` + `Suspense` (`App.tsx`): в первый заход в бандле остаются только React + роутер
+ оболочка (LoginPage статичный). Тяжёлый `GraphPage` (vis-network/vis-data) — отдельный ленивый
чанк, грузится только при входе на «Модель здоровья». Цифры `vite build` (было → стало):
index 783 КБ (gzip 235) → 161 КБ (gzip 52), GraphPage 555 КБ (gzip 170) — отдельно, по требованию.
Остальные страницы разбились на мелкие чанки (5–17 КБ). Пользовательский ответ на вопрос «грузятся
ли другие модели сразу?»: НЕТ — рендерится только выбранная модель, раскладка подтягивается
`GET /api/graph/positions?model=` при переключении.

### «Модель здоровья»: детали SLA/услуги под графом вместо перехода на страницу (2026-10-10)

По просьбе пользователя убран переход на отдельную страницу SLA при клике на узел в графе:
клик по SLA или услуге теперь **выбирает узел** (подсветка обводкой + тень) и показывает его
детали **под графом** в отдельной панели (SLA — детали/SLO/исключения простоя, услуга — живая
конфигурация из Zabbix):

- **GraphPage** больше никуда не навигейтится (`onNavigate` из пропсов убран; `App.tsx`
  `case 'graph'` без пропсов; страница `sla-detail` осталась для Dashboard).
  Клик по `sla-*` → панель `SLADetailCard`; клик по `svc-*` → `ServiceConfigCard`.
  Панель рендерится ТОЛЬКО по клику (при старте — карточка-подсказка), ничего не грузится
  заранее ⇒ «лага» нет. Клик по родителю/ребёнку услуги или связанной услуге SLA в карточке
  переключает услугу и при необходимости модель (`selectServiceByZid`). Смена модели
  через селектор сбрасывает выбор. Подсветка: на узлах храним `_defaultBorderWidth`/
  `_defaultShadow`, `applySelectionHighlight` (реф предыдущего vis-id) восстанавливает вид;
  после пересоздания графа подсветка применяется в конце `renderGraph`.
- **Общие компоненты:** `src/components/ServiceConfigCard.tsx` (карточка конфигурации услуги,
  экспортирует `statusColor/statusLabel`, родители/дети через `onSelectService`, крестик
  `onClose`) и `src/components/SLADetailCard.tsx` (детали SLA: SLO/расписание/связанные услуги/
  исключения простоя с модалкой добавления). `ServicesPage` и `SLADetailPage` используют их —
  код не дублируется (D/R).
- **Убраны карточки-списки «SLA (N)»/«Услуги (M)»** под панелью деталей (по просьбе
  пользователя): граф + панель деталей по клику закрывают всё, счётчики и числовые id
  остались в шапке и в карточках.
- Проверено: `tsc --noEmit` чистый, `vite build` OK, pytest 20/20, frontend :3000 и backend
  :8000 отвечают 200.

### Страница «Услуги» — конфигурация услуг из Zabbix для ИТ-специалистов (2026-10-10) — ЗАКОММИЧЕНО

По просьбе пользователя («ИТ-специалисты должны видеть, как настроены услуги/модель
здоровья: родители, теги проблем, алгоритм, распространение, дочерние услуги») на сайте
добавлена страница **«Услуги»** (меню Layout после «Модель здоровья», роли
admin/planner/viewer — чтение для всех):

- **Backend:** `zabbix_client.service_config_get(serviceid)` — `service.get` c
  `selectParents/selectChildren/selectProblemTags/selectTags` + `output: extend`;
  новый эндпоинт **`GET /api/services/{zabbix_serviceid}/config`** (любая роль): живая
  конфигурация с русскими ярлыками (algorithm/status/propagation_rule/операторы тегов),
  `created_at` (unixtime → ISO), списки родителей/детей `{serviceid,name,status}`,
  `problem_tags`, `tags`. Услуги нет в Zabbix → 404, ошибка Zabbix → 502.
- **Frontend:** `src/pages/ServicesPage.tsx` — слева поиск по всем услугам (по имени)
  + дерево выбранной модели (отступы по глубине, цветные точки статусов); справа карточка
  конфигурации: имя/статус-бейдж, родительские услуги (кликабельны — переключают услугу),
  теги проблем (таблица Имя/Операция/Значение), порядок сортировки, правило вычисления
  состояния (+ пояснение «как считается статус»), описание, дата создания, расширенная
  настройка (правило распространения состояния + вес), дочерние услуги (кликабельны),
  теги услуги. `realClient.getServiceConfig()`.
- **Тесты:** +2 (`test_service_config`, `test_service_config_not_found`) → pytest 20/20,
  `tsc --noEmit` чистый, Vite компилирует страницу без ошибок, живой эндпоинт проверен
  (798/796 под ролью viewer).
- **Факты Zabbix 7.0 (проверены живьём):** `algorithm` 0=«Установить статус ОК»,
  1=«Самое критичное, если все дочерние в проблеме», 2=«Самое критичное из дочерних услуг»
  (на стенде 690 услуг с 2, 21 с 1); `status` -1=OK, 0..5=критичность проблемы (на стенде
  708×-1, 3×4=High); `propagation_rule` 0=как есть, 1=повышение, 2=понижение, 3=игнор,
  4=фиксированный (на стенде всё 0); `selectRules` («дополнительные правила») `service.get`
  НЕ поддерживает — «Invalid parameter», секция на сайте не показывается;
  `selectParents/selectChildren` возвращают только скалярные поля (без problem_tags/тегов).
  Значения enum документированы в `routers/services.py` (комментарии).

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

- [x] **Переезд на PostgreSQL (2026-10-12)**: dev+прод на Postgres 16 (compose), миграции как
      источник истины, `asyncpg`, фикс boolean-дефолта в `005`, данные пересозданы синком
      (67/711/201). Резервная копия старой SQLite — `/tmp/opencode/db-backup/`.
- [x] **Оптимизация синхронизации (пункты 1–7, 2026-10-12)** — см. ловушку №29.
      Сделано: **3** (bulk-upsert `ON CONFLICT`), **4** (связи O(N+M)), **5** (prune по ключам +
      чанки) — синк 1.35 c → 0.28 c; **2** (пагинация невозможна для sla/service — Zabbix 7.0
      отвергает `offset`; вместо неё точечные запросы по id + узкий output, синк ~0.15–0.24 c);
      **7** (лок от параллельных синков: asyncio.Lock + pg_try_advisory_xact_lock, занятый
      синк → 409); **6** (фоновый полный синк: POST /sync/full → 202 + GET /sync/status; фронт
      поллит и держит «Синхронизация…» до конца); **1** (автосинк по расписанию: планировщик в
      lifespan, `SYNC_AUTO_INTERVAL_MINUTES`, статус `scheduler`, строка на «Настройках») —
      **все 7 пунктов закрыты**. Коммиты «sync: bulk upsert…», «zabbix client: …»,
      «sync: лок от параллельных синков», «sync: фоновый запуск…», «sync: автосинк…».
- [ ] **Перенос данных из старой SQLite (опционально)** — если пользователю понадобится вернуть
      ручную раскладку графа/цвета узлов: дамп в `/tmp/opencode/db-backup/sla_planner.sqlite.bak.*`
      (таблицы `graph_node_positions`, `graph_node_styles`).
- [x] **Модель прав «как в Grafana»** (2026-10-10): роли admin/user + группы с правами, страница
      «Группы», конвертация planner/viewer — реализовано (см. историю). Возможное развитие:
      аудит-лог по изменениям групп/прав; выдача прав на уровне отдельного объекта (сейчас — только
      страницы+действия).
- [x] **Новая фича** (описана 2026-10-10): страница «Услуги» с показом конфигурации услуг
      из Zabbix для ИТ-специалистов — реализовано (см. историю выше). Возможное развитие:
      редактирование конфигурации услуг админом (сейчас только просмотр).
- [ ] **Другие триггеры для модели Q3MET ТЭСЦ-1** («потом», по словам пользователя): у листов
      «Доступность порта бд» (1226/781/779) и «Доступность БД …» (1279/780/777) можно завести
      соответствующие триггеры/`problem_tags` — расширить `setup_q3met_test_hosts.py`.
- [ ] **Проверить UI вживую** — сессия проверила API-слой, но браузерную проверку
      «Модели здоровья»/работ и граф-редактирования делает пользователь. Новое:
      дерево структуры модели справа от графа (сворачивание, клик по узлу → конфигурация под
      графом; SLA 798 «Доступность по ping» в модели Q3MET ТЭСЦ-1 — статус «Высокая»,
      тег `service=Q3MET ТЭСЦ-1»; клик по SLA → связанные услуги кликабельны).
- [ ] (low) `sla_planner/frontend/Dockerfile` — docker-путь деплоя требует донастройки (см. README).
- [x] **Тёмная/светлая тема + раскатка токенов на все страницы** (2026-10-11): реализовано (см.
      историю). Инлайн-кнопки страниц переведены на `Button`, добавлены анимации (2026-10-11).
      Возможное развитие: расширять примитивы (карточки/бейджи/инпуты/модалки); подставить реальный
      логотип ОМК (SVG/PNG) в `BrandMark`; по умолчанию брать тему из системного `prefers-color-scheme`
      (сейчас — светлая).

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
    пакет `app`). Миграции: `001_initial` → `002_add_service_tags` → `003_graph_tables` → `004_groups`
    → `005_group_models`. Dev-БД, наполненную через `create_all`, пометить
    `venv/bin/python -m alembic stamp head`, иначе `upgrade` упадёт на существующих таблицах.
    `app/seed.py` — идемпотентный bootstrap пользователей и системных групп (мок-данных больше нет).
    `alembic.op.create_table` НЕ принимает `checkfirst=` — проверять существование таблиц через
    `sa.inspect(bind)`.
16. **Zabbix 7.0 service/problem_tags/триггеры:** услуга с дочерними услугами НЕ может иметь
    `problem_tags` («cannot have problem tags and children at the same time») — теги проблем
    вешать ТОЛЬКО на листовые услуги (пример: листья «Доступность по ping» 809/778/798
    в дереве Q3MET ТЭСЦ-1). Item `icmpping` без параметра уходит в unsupported — цель задавать
    в ключе: `icmpping[<ip>]`, и в выражении триггера ключ указывать ТОЧНО как у item:
    `last(/host/icmpping[<ip>])=0` (иначе trigger.create: «Incorrect item key»).
    Теги на триггере вешать `tags: [{"tag":"service","value":...}]` — Zabbix сразу
    обновляет теги открытых проблем. `service.get` не поддерживает `selectAncestors`/`problem_count`.
    Привязка тестовых хостов Q3MET через тег `service` на хосте+триггере и `problem_tags` на листе
    автоматизирована в `setup_q3met_test_hosts.py` (идемпотентный, запускать из корня репо).
17. **Конфигурация услуги (карточка под графом на «Модели здоровья»):** живые данные —
    `GET /api/services/{id}/config`
    (`service.get` + selectParents/selectChildren/selectProblemTags/selectTags).
    Значения Zabbix 7.0: `algorithm` 0/1/2 («Установить статус ОК» / «Самое критичное, если все
    дочерние в проблеме» / «Самое критичное из дочерних услуг»); `status` -1=OK, 0..5=критичность
    проблемы; `propagation_rule` 0..4 (как есть / повышение / понижение / игнор / фиксированный);
    операторы тегов проблем 0..3 (Равно/Не равно/Содержит/Не содержит); `created_at` — строка
    unixtime UTC. **`selectRules` («дополнительные правила») `service.get` НЕ принимает**
    (Invalid parameter, проверено на 7.0.31) — эту секцию с API не показать;
    `selectParents/selectChildren` отдают только скалярные поля (без problem_tags/тегов).
18. **Клик по узлу на «Модели здоровья»** теперь НЕ переходит на другую страницу — выбирает узел
    и показывает детали под графом (`SLADetailCard`/`ServiceConfigCard` — общие компоненты,
    используются и на страницах). `ServiceConfigCard` сам грузит конфигурацию по `serviceId` и
    живёт и на «Услугах», и под графом. Подсветка узла — через кастомные поля
    `_defaultBorderWidth`/`_defaultShadow` в DataSet (vis их игнорирует при отрисовке, но хранит);
    `applySelectionHighlight` снимает подсветку предыдущего узла по рефу. Смена модели через
    селектор сбрасывает выбор (а программный переключатель модели из карточки — сохраняет).
19. **Vite может держать устаревшую трансформацию модуля** после серии быстрых правок одного файла
    (например, `GraphPage.tsx`): по прямому URL `/src/pages/GraphPage.tsx` отдаётся СТАРАЯ версия
    (проверить: `curl -s localhost:3000/src/pages/GraphPage.tsx | grep -c SLADetailCard`, должно быть
    не 0; со свежим `?t=` query — новый код). Лечение: перезапустить vite (`kill <pid>` + `npm run dev`),
    пользователю — жёсткий reload (Ctrl+Shift+R). Симптом у пользователя: «пропали/не появились
    изменения после нажатий», хотя код на диске и typecheck/build зелёные.
20. **`opencode.json` (конфиг MCP, содержит API-ключ TestSprite) — НЕ КОММИТИТЬ:** файл в
    `.gitignore` (2026-10-10 вычищен из git и из всей истории, ветка force-push'нута). Локально
    нужен для MCP-серверов; ключ в нём задаётся через `{env:TESTSprite_API_KEY}` — задавать
    переменную в окружении. Любые API-ключи/токены в репозиторий не класть.
21. **Playwright (ui-verify):** `@playwright/test` — devDependency фронтенда, браузеры в
    `~/.cache/ms-playwright` (не в git). Если браузер не стартует из-за «cannot open shared
    library: libnspr4.so / libnss3 / libasound2» — системные зависимости: `sudo npx playwright
    install-deps chromium`; без sudo временно: `apt-get download libnspr4 libnss3 libasound2t64`
    → `dpkg -x` в `/tmp/opencode/rootfs` → запуск с
    `LD_LIBRARY_PATH=/tmp/opencode/rootfs/usr/lib/x86_64-linux-gnu`. Прогон: `npx playwright test
    .opencode/skills/ui-verify/scripts/ui-check.spec.ts` (проверено: 10 passed — «Модель здоровья»,
    «Права: меню по правам групп + страница «Группы» у admin», «Время: аудит-лог показывает
    московское время (MSK)», «Навигация: F5 и закладка сохраняют текущую страницу»,
    «Модель здоровья: выбранная модель переживает F5»,
    «Навигация: закладка на чужую страницу не открывается (viewer → дашборд)»,
    «Пользователи: при создании нет выбора групп», «Тема: переключение light/dark и сохранение
    после F5», «Кнопки: единый примитив Button (модалка «Новая работа»)»,
    «Анимации: модалка и карточки дашборда появляются плавно»). Внимание: vite-watcher следит и за
    файлами вне `src` (spec/бэкенд) и шлёт полный page-reload подключённым клиентам — правь spec до
    прогона, иначе тест сбросится на «Дашборд».
22. **Модель прав (с 2026-10-10):** роли `admin`/`user`; права `user` = сумма прав его групп (как
    команды в Grafana). Каталог и хелперы — `app/permissions.py` (бэк) ↔ `src/permissions.ts`
    (фронт), держать синхронно. Проверки: `require_admin` / `require_permission(...)` (admin
    проходит всегда); на фронте — `can(permission)` из `useAuth()` (вместо `hasRole`). Страница
    «Группы» (`/api/groups`, admin-only) — права + состав; системные группы (seed) удалить нельзя.
    Каталог `ALL_PERMISSIONS` — страницы `dashboard/model/works/reports/audit` + действия
    `works.edit/works.delete/sla.edit/graph.edit`. `sync.run` в каталог групп НЕ входит: полная
    синхронизация доступна только роли admin, у обычных пользователей нет и следа интеграции. **`get_current_user` живёт в
    `app/deps.py`** (не в `routers/auth.py`, который реэкспортит его) — иначе цикл импортов
    auth↔permissions.
    **Членство в группах задаётся только на странице «Группы»** (`/api/groups`, поле `member_ids`).
    В форме пользователя (`UsersPage`) выбора групп нет: новый пользователь создаётся без групп,
    при редактировании `group_ids` не отправляется (иначе легко случайно снести членство). Бэкенд
    `POST/PUT /api/users` всё ещё принимает `group_ids` (нужно тестам), но UI его не использует.
23. **Время (с 2026-10-10): наружу — только UTC с зоной, UI — МСК.** SQLite не хранит TZ:
    `DateTime(timezone=True)` + `server_default=func.now()` дают *naive*-UTC. Отдавать такое
    время через `.isoformat()` нельзя — браузер трактует строку без зоны как локальную и метки
    уезжают на смещение (для МСК −3 ч). Правило: наружу — через `app/timeutil.py: iso_utc()`
    (добавляет `+00:00`), входящие моменты — через `parse_utc()` (приводит к UTC). На фронте
    любые метки — через `src/time.ts` (`formatDateTime`/`formatDate`/`formatTime`/…, жёстко
    `timeZone: 'Europe/Moscow'`), поля `datetime-local` — `toMskInputValue`/`mskInputToDate`
    (подписи в форме работы — «(МСК)»). Не возвращать `toLocaleString` без `timeZone`.
24. **Навигация — через hash URL (`src/navigation.ts`), а не только React-состояние.** Страница
    живёт в `#/graph`, `#/works`, `#/sla-detail?id=…`: перезагрузка (F5), закладки и кнопки
    браузера сохраняют позицию. Список пунктов меню — единый `NAV_ITEMS` (Layout + проверка
    доступа `isPageAllowed`). Новую страницу добавлять: пункт в `NAV_ITEMS` + `case` в
    `App.tsx:renderPage` + (если нужно) право в `isPageAllowed`. Гвард не пускает на страницу
    без права — откат на `#/dashboard`; при выходе маршрут сбрасывается на дашборд.
    **Выбранная модель здоровья** на `#/graph` — параметр `?model=<rootId>`; сам выбор ещё и
    дублируется в `localStorage` (`sla_graph_model`), приоритет: URL → `localStorage` → первая
    доступная модель. Смену модели писать через `history.replaceState` (см. `App.tsx:setGraphModel`),
    чтобы «назад» не листал модели. Новые «внутренние» состояния страниц (фильтры, выбранный объект)
    при желании персистить так же — но по умолчанию они сбрасываются при F5.
25. **Фронтенд должен работать офлайн (закрытый контур ОМК).** Внешняя зависимость была одна —
    Font Awesome с `cdnjs.cloudflare.com` — **убрана**. Иконки — только `lucide-react` (SVG
    вкомпилированы в бандл), шрифт — `@fontsource/inter` (импорт в `src/main.tsx`), логотип —
    инлайн-SVG `src/components/BrandMark.tsx`. **Никаких `http(s)://` в ассетах** (CDN, Google
    Fonts, внешние иконки/картинки): сервер переедет в доменную подсеть без интернета. Проверка:
    `npm run build` кладёт Inter (`inter-*.woff`) в `dist/assets`. Визуальный словарь — в
    `src/index.css` (`@theme`): акцент `brand-*` (не `blue-*`), поверхности `bg-canvas`/`bg-surface`,
    границы `border-line`, тени `shadow-card`/`shadow-card-hover`, тайминг `ease-standard`. Кнопки —
    общий примитив `src/components/ui/Button.tsx`; микро-интеракции — `hover:-translate-y-px` +
    подмена фона, «вжатие» на active, кольцо `:focus-visible`. Есть `prefers-reduced-motion`.

26. **Тема (light/dark) — только через семантические токены.** Страницы не должны использовать
    «голые» `gray-*`/`bg-white`/`text-gray-*`: в тёмной теме они останутся светлыми и текст
    «пропадёт». Правило: поверхности — `bg-canvas`/`bg-surface`/`bg-surface-2`, текст —
    `text-content`/`text-muted`/`text-faint`, границы — `border-line`/`border-line-strong`, акцент —
    `text-accent`/`bg-accent-soft`/`border-accent-line`, статусы — `bg-ok-soft`/`text-ok-fg`/
    `border-ok-line` (аналогично `warn`/`danger`). Значения — в `src/index.css`: светлые в `@theme`,
    тёмные в блоке `.dark` (**вне** `@layer` — поэтому он перекрывает theme-слой Tailwind; `@theme`-
    значения это CSS-переменные, а утилиты Tailwind ссылаются на них через `var(...)`, так что
    каскадное переопределение работает). Тема в `localStorage['sla_theme']`, класс `.dark` — на
    `<html>`; инлайн-скрипт в `index.html` ставит его до бандла (иначе вспышка светлой темы при F5).
    Сайдбар и бренд-панель логина — намеренно всегда тёмные (`slate-*`), их токенами НЕ переводить.
    Графики статусов на «Модели здоровья» рисуются hex из API (`statusColor`) — на тёмном фоне ок.
    Контраст тёмной темы проверяется Playwright-аудитом (см. историю 2026-10-11).

27. **Кнопки и анимации — единые.** Кнопки *действий* (primary/secondary/ghost/danger/success/
    warning/danger-soft) делать только через `src/components/ui/Button.tsx`, не инлайнить классы —
    иначе разъезжаются состояния и микро-интеракции. `Button` по умолчанию `type="button"`; для
    отправки формы явно `type="submit"` + `loading`. Специализированные кнопки (чипы-фильтры,
    таб-переключатели, иконки в строках таблиц) на `Button` не переводить — только
    `transition-colors`. Анимации — в `src/index.css`: `animate-fade-in-up` (смена страницы в
    `Layout` через `key={currentPage}`), `animate-scale-in`/`animate-overlay-in` (модалки),
    `.stagger > *` (каскад карточек: дашборд, отчёт). `prefers-reduced-motion` гасит длительности
    глобально — новые анимации добавлять как CSS (`@keyframes` + токен `--animate-*`), не в JS.

28. **PostgreSQL (dev+прод, с 2026-10-12).** БД — Postgres 16 в docker compose (том
    `sla_planner_postgres_data`, `restart: unless-stopped`). Миграции — источник истины: `Dockerfile`
    перед uvicorn гоняет `python -m alembic upgrade head`. **Postgres строже SQLite:** boolean-дефолты
    только `sa.true()`/`sa.false()` (или `true`/`false` в `op.execute`) — литерал `1` Postgres
    отвергает (на этом падала `005_group_models`); raw SQL в миграциях писать переносимо.
    Один `alembic upgrade head` в async-`env.py` идёт **одной транзакцией**: если упал на N-й миграции —
    откатывается ВСЁ (в БД не остаётся таблиц), чинить миграцию и перезапускать с нуля. Zabbix-стек
    держит свой `postgres:15` (`zabbix-db`) — это ДРУГОЙ контейнер, наружу не проброшен, не путать с
    БД сайта.
29. **Пункты 1–7 по синхронизации (обсуждено 2026-10-12).** Синк полностью ручной, но
    оптимизирован. Сделано: **3** (bulk-upsert `ON CONFLICT`), **4** (связи SLA↔услуга через
    обратный индекс, O(N+M)), **5** (prune сравнением ключей в Python + порционные DELETE без
    гигантского `NOT IN`) — `app/services/sync.py`, синк 1.35 c → 0.28 c; **2** — пагинации
    НЕТ и быть не может: Zabbix 7.0 отвергает `offset` для `sla.get`/`service.get` (проверено
    живьём; у `host.get` offset работает) — вместо неё точечные запросы по id (`sla_get_by_id`
    через фильтр `slaids`) и узкий `output` вместо `extend` в `sla_get`/`service_get`, `sla_get`
    по умолчанию без `excluded_downtimes` (синк ~0.15–0.24 c); **7** — лок от параллельных
    синков: `asyncio.Lock` в процессе + неблокирующий `pg_try_advisory_xact_lock` (Postgres,
    освобождается коммитом/откатом транзакции) в `sync_lock(db)` (`app/services/sync.py`);
    полный и частичные синки (`/api/sync/full`, `/api/sla/sync`, `/api/services/sync`) обёрнуты;
    при занятом локе — `SyncInProgressError` → 409 через handler в `app/main.py`, а не ожидание;
    **6** — фоновый запуск: `POST /api/sync/full` отдаёт `202` и стартует синк в asyncio-задаче
    (`start_full_sync()`), прогресс — `GET /api/sync/status`; фоновая задача открывает СВОЮ
    сессию (`async_session`) и коммитит сама; `_sync_task` держит ссылку на задачу (иначе GC
    может её собрать); фронт (`api.syncFull`) прозрачно поллит статус; **1** — автосинк по
    расписанию: планировщик `_auto_sync_loop` поднимается в lifespan (`start_auto_sync`/
    `stop_auto_sync` в `app/main.py`) и раз в `SYNC_AUTO_INTERVAL_MINUTES` (default 60) вызывает
    `start_full_sync()` — тот же лок и статус; `SYNC_AUTO_ENABLED=false` или интервал `0` —
    выключить; статус несёт блок `scheduler {enabled, interval_minutes, next_run_at}`; на
    «Настройках» (admin) видно расписание. **Все 7 пунктов закрыты.**
    `_upsert_stmt` выбирает диалект по `db.get_bind().dialect.name` (postgresql/sqlite) —
    при добавлении других диалектов расширить.
30. **ui-verify: аудит-лог может быть пустым.** Тест «Время: аудит-лог показывает МСК»
    на свежей БД падал (`[0]` на пустом массиве). Теперь при пустом `GET /api/audit/`
    делается `test.skip` (тест данных-зависимый). Для реального прогона нужно сначала создать
    запись аудита легитимным действием (создать/изменить группу или плановую работу).

---

## 6. Как начать диалог с агентом

Примеры первого сообщения в ACP-панели VS Code:

- Быстрый старт: **«Прочитай CONTEXT.md и продолжи работу по TODO.»**
- Конкретная задача: **«Прочитай CONTEXT.md, затем закоммить изменения в ветку sla-planner-zabbix-integration-ebdcf с сообщением "sync: full sync endpoint, tag-based links, prune"».**
- Вопрос: **«Прочитай CONTEXT.md. Как в Zabbix 7.0 связать хост с услугой и почему в проекте используется тег service?»**
- Завершение дня (перенос в новый чат): **«Запиши итог сессии в CONTEXT.md и закоммить: что сделано, что осталось, новые факты и ловушки, актуальный TODO.»**

Агент работает в том же каталоге `/opt/sla_planner1` — файлы, git и терминал общие с любой другой сессией. Новый чат АИ не помнит старые — «память» это CONTEXT.md в git: прочитал в начале → продолжил, обновил в конце → зафиксировал для следующего чата.
