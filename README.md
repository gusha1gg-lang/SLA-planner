# SLA Planner

Веб-портал планирования плановых техработ с автоматической интеграцией с **Zabbix 7.0**.
Инженер планирует работу через удобный веб-интерфейс — портал сам создаёт в Zabbix
«исключение простоя» (`excluded_downtime`) **с именем, равным заголовку работы**,
чтобы плановая техработа не попадала в расчёт SLA и не ломала SLA-отчётность.

> ⚠️ Проект работает **только с живыми данными из Zabbix** (через Zabbix JSON-RPC API).
> Мок-данные и фолбэки на фронтенде удалены — без доступного бэкенда/Zabbix сайт не запускается (это норма).

---

## О чём проект

SLA Planner — мост между специалистами и системой мониторинга:

1. В Zabbix заводятся **SLA** (с тегами `service_tags`) и **услуги** (с тегом `service`),
   а также хосты с этим же тегом (проблемы хостов «скатываются» в услуги через `problem_tags`).
2. Портал **синхронизирует** SLA и услуги из Zabbix в свою БД (`POST /api/sync/full`)
   и строит связи «SLA → услуги» **по тегам** — без ручного сопоставления.
3. Специалист создаёт **плановую работу** (ТО базы, обновление, замена сертификата и т.п.)
   с указанием SLA, услуги и периода.
4. **Push в Zabbix**: портал добавляет в SLA окно исключённого простоя
   (`excluded_downtime`) на период работы — плановый простой не считается простоем по SLA.
5. **Правки запланированных работ** автоматически прокатываются в Zabbix:
   переименовал/сдвинул по времени — окно в Zabbix обновится само.

Всё, что выводится на сайте, читается из живых объектов Zabbix и синхронизированных копий;
никакой ручной двойной ввод.

## Возможности

- **Синхронизация** — SLA, услуги и связи SLA↔услуги одним кликом (`POST /api/sync/full`,
  кнопка в статус-баре); `prune` чистит объекты, пропавшие в Zabbix.
- **Модель здоровья** — интерактивная визуализация (vis-network): SLA-узлы ↔ услуги, справа —
  дерево структуры модели (сворачиваемое, статусы); клик по SLA/услуге → детали под графом.
- **Конфигурация услуг из Zabbix** — по клику на услугу (на графе или в дереве модели): живые
  данные из Zabbix — родители/дети, теги проблем, алгоритм вычисления состояния, правило
  распространения, вес, описание, дата создания; для ИТ-специалистов (роли admin/planner/viewer).
- **Плановые работы** — таблица (пагинация, фильтры по статусу) и календарный вид;
  создание/редактирование/удаление с подтверждением.
- **Push в Zabbix** — создание `excluded_downtime` именем = заголовок работы; повторный push идемпотентен.
- **Автосинк правок** — у запланированной (`planned`) работы PUT обновляет и окно в Zabbix
  (название + период); при переносе на другой SLA убирает старое окно; при сбое — 502 и откат.
- **Исключения простоя в деталях SLA** — живые из Zabbix: просмотр, добавление, удаление.
- **Отчёт** — статистика доступности и исключений, экспорт в CSV.
- **Аудит-лог** — кто, когда, что сделал.
- **Роли** — `admin` / `planner` / `viewer` (JWT).
- **Статус-бар** — индикатор подключения к бэкенду и Zabbix, read-only badge.
- **Toast-уведомления** — успех, ошибки, предупреждения.

## Стек

### Frontend (корень репозитория)
- React 18 + TypeScript + Vite 6 + Tailwind CSS 4
- vis-network (граф), recharts (отчёты), react-router-dom
- `npm run dev` → **:3000**, Vite-прокси `/api` и `/health` → `localhost:8000`

### Backend
- Python 3.11+ (проверено на 3.14), FastAPI, SQLAlchemy (async)
- `httpx` — JSON-RPC клиент Zabbix 7.0 (`Authorization: Bearer <token>`)
- JWT-auth (python-jose + bcrypt), Alembic-миграции
- БД сайта: SQLite (dev/test) / PostgreSQL (prod)

## Структура репозитория

```
/                                    # корень репо = Frontend
├── index.html, package.json, vite.config.js
├── src/
│   ├── api/                         # api-клиент (всегда реальный бэкенд, без моков)
│   ├── components/                  # Layout, StatusBar, ConfirmModal, Pagination, Toast
│   ├── context/                     # AuthContext, ToastContext
│   └── pages/                       # Dashboard, Graph, Works, SLADetail, Report,
│                                    # Audit, Users, Settings, Login
├── sla_planner/
│   ├── backend/                     # FastAPI backend
│   │   ├── app/
│   │   │   ├── models/              # User, SLA, Service, SlaServiceLink, PlannedWork, AuditLog, GraphNodePosition, GraphNodeStyle
│   │   │   ├── schemas/
│   │   │   ├── routers/             # auth, sla, services, planned_works, audit, users, sync, graph
│   │   │   └── services/            # zabbix_client (JSON-RPC), sync, auth
│   │   ├── alembic/                 # миграции (001_initial, 002_add_service_tags, 003_graph_tables)
│   │   ├── tests/                   # pytest (20 тестов)
│   │   ├── requirements.txt
│   │   ├── .env.example
│   │   └── Dockerfile
│   ├── docker-compose.yml           # деплой приложения (postgres + backend + frontend/nginx)
│   ├── frontend/Dockerfile          # образ фронта (контекст — корень репо, требует правки)
│   └── .env.example
├── CONTEXT.md                       # контекст проекта для агента (handoff)
└── README.md
```

> Примечание: `sla_planner/frontend/Dockerfile` собирается из корня репо
> (`COPY package*.json`, `COPY . .`) — docker-путь деплоя ещё требует донастройки;
> основной рабочий путь — локальный `npm run dev` + uvicorn.

## Быстрый старт

### 1. Zabbix 7.0

Нужен доступный Zabbix 7.0 (`/api_jsonrpc.php`) и API-токен
(UI → Users → API tokens, роль с правами на SLA). Токен передаётся как `Authorization: Bearer <token>`.

### 2. Backend

```bash
cd sla_planner/backend
python -m venv venv
source venv/bin/activate            # Linux/WSL: source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env                # и заполните реальные значения
```

Минимум в `.env`:

```env
DATABASE_URL=sqlite+aiosqlite:///./sla_planner.db
SECRET_KEY=<openssl rand -hex 32>
ZABBIX_API_URL=http://<zabbix>/api_jsonrpc.php
ZABBIX_API_TOKEN=<токен из Zabbix>
ZABBIX_READ_ONLY=false              # true на проде; false только когда готовы писать SLA
```

Создание схемы и запуск:

```bash
venv/bin/python -m alembic upgrade head
venv/bin/uvicorn app.main:app --reload --port 8000
```

> Dev-запуск дополнительно создаёт таблицы автоматически (`create_all` в `app/main.py`).
> Если БД уже наполнена через `create_all`, пометьте её `venv/bin/python -m alembic stamp head`,
> чтобы `alembic upgrade` не пытался создавать существующие таблицы.
> Alembic берёт URL из `DATABASE_URL` приложения (`.env`), запускать через `python -m alembic`.

Пользователи создаются bootstrap-скриптом `python -m app.seed` — он идемпотентно заводит
**только пользователей** (никаких мок-данных: SLA/услуги приходят из Zabbix) — либо вручную
через `routers/users.py`.
Тестовые учётки: `admin/admin123`, `planner/planner123`, `viewer/viewer123`.

### 3. Frontend (корень репо)

```bash
npm install
npm run dev          # http://localhost:3000, прокси /api → :8000
```

### 4. Тесты

```bash
cd sla_planner/backend
DATABASE_URL=sqlite+aiosqlite:///./test_sla.db venv/bin/python -m pytest tests/
# frontend:
npm run typecheck    # tsc --noEmit
```

> ⚠️ Тесты дропают все таблицы в БД, указанной в `DATABASE_URL`, — запускайте их
> только на изолированной тестовой БД (`test_sla.db`), не на рабочей.

## Вход в систему

Логин — через **query params** (`POST`), токен называется `access_token`:

```bash
curl -X POST 'http://localhost:8000/api/auth/login?username=admin&password=admin123'
# → { "access_token": "...", "token_type": "bearer", "user": {...} }
# далее: Authorization: Bearer <access_token>
```

Роли: `admin` (всё), `planner` (создание/редактирование/push работ), `viewer` (только чтение).

## API (основное)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/health`, `/api/version`, `/api/zabbix/status` | статус, версия, подключение к Zabbix |
| POST | `/api/auth/login?username=&password=` | вход (query params!) → `access_token` |
| GET | `/api/auth/me` | текущий пользователь |
| GET | `/api/sla/` | SLA (с `service_tags` как `string[]`) |
| GET | `/api/sla/service-links` | связи SLA ↔ услуги |
| GET/POST | `/api/sla/{zabbix_slaid}/excluded-downtimes` | просмотр/добавление окна простоя (живое, через Zabbix) |
| DELETE | `/api/sla/{zabbix_slaid}/excluded-downtimes/{name}` | удаление окна простоя (admin) |
| GET/POST | `/api/services/`, `/api/services/sync` | услуги |
| GET/POST | `/api/works/` | плановые работы |
| PUT | `/api/works/{id}` | редактирование (+ автосинк окна в Zabbix для `planned`) |
| POST | `/api/works/{id}/push` | отправить окно работы в Zabbix (`name = title`) |
| DELETE | `/api/works/{id}` | удалить работу (admin) |
| POST | `/api/sync/full` | полная синхронизация SLA → услуги → связи |
| GET | `/api/audit/` | аудит-лог |
| GET/POST/PUT | `/api/users/...` | пользователи (admin) |

Схема — в Swagger UI: `http://localhost:8000/docs`.

## Безопасность

- Портал **не** трогает хосты, триггеры и алерты Zabbix — работает только через JSON-RPC API.
- **Единственный пишущий метод — `sla.update`** (read-modify-write через `sla.get`).
- На проде `ZABBIX_READ_ONLY=true` блокирует все записи на уровне клиента.
- Авторизация — JWT, роли на каждый endpoint, полный аудит изменений.

## Zabbix 7.0 — важные факты (из опыта)

- SLA и Service — **разные** сущности (`slaid ≠ serviceid`).
- Связь SLA ↔ услуги — **по тегам**: у услуги тег `service: <имя>`, у SLA `service_tags` с тем же значением.
- Связи «услуга ↔ хост» в API нет — только через теги (`problem_tags` услуги матчит теги проблем хоста).
- Авторизация: `Authorization: Bearer <token>` (не `auth` в теле).
- `selectExcludedDowntimes` — camelCase.
- `excluded_downtimes` — массив `{name, period_from, period_to}`: **все значения строками**, unixtime UTC.
- `sla.update` **перезаписывает** весь массив `excluded_downtimes` — нужен read-modify-write.

## Тестовый стенд Zabbix

Тестовый Zabbix (`localhost:8080`) содержит реальную (прод-подобную) структуру:
**67 SLA / 711 услуг / 68 моделей здоровья** (дерево услуг ≈643 ребра). Сайт наполняется
кнопкой «Синхр. с Zabbix» (admin) или `POST /api/sync/full`. Перенос структуры с прод-Zabbix
выполняется скриптами `import_test.py` + `fix_tree_uuid.py` (см. `CONTEXT.md`).

---

## Разработка

- Ветка: `sla-planner-zabbix-integration-ebdcf` (запущена в origin).
- Для агентов и handoff: читай `CONTEXT.md` — там история, доступы, ловушки и TODO.
