# CONTEXT.md — контекст проекта для работы агента

> Файл создан, чтобы новый агент (в т.ч. в ACP-панели VS Code) быстро разобрался в ситуации.
> Читай целиком перед началом работы. Обновляй файл по ходу значимых изменений.

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

### Синхронизация Zabbix ↔ сайт (главное изменение) — ЗАКОММИЧЕНО (3f577ca)

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
- **Услуги:** `1С` (serviceid=4), `SAP` (serviceid=5), `Test Service 1` (serviceid=3).
  У каждой: тег `service: <имя>` (= что забирает SLA Planner) + `problem_tags: service=<имя>` (= проблемы хостов скатываются в услугу).
- **Хосты:** `1c-app-01`, `1c-db-01` (тег `service: 1С`), `sap-app-01`, `sap-db-01` (тег `service: SAP`).
- **SLA:** `Test SLA v3` (slaid=5, `service_tags: ["Test Service 1"]`), `ERP` (slaid=6, `service_tags: ["1С", "SAP"]`, period=0 / 24x7).
- Важно про Zabbix 7.0: **прямой связи «услуга ↔ хост» в API нет** (нет параметров `hosts`/`selectHosts`). Связь только через теги: хост с тегом → проблема наследует теги → `problem_tags` услуги матчит их.

### Проверено
- Полный синк: `POST /api/sync/full` → `{"slas":2,"services":3,"links":3}`; ERP связан с 1С и SAP (`service-links`: sla2→svc2, sla2→svc3).
- Prune работает (фейковые SLA/услуга/связь удалились при синке).
- End-to-end push: работа ERP/1С → push → в Zabbix у ERP (slaid=6) создан `excluded_downtime "SLA Planner #1"`; работа удалена, downtime в Zabbix прибран.
- `npx tsc --noEmit` — чисто. `pytest` — 12/12.
- **Ловушка:** `get_db` коммитит ПОСЛЕ формирования ответа (teardown dependency). Сразу следующий запрос (push/GET) может на доли секунды видеть старое состояние (404 Work not found / висящая удалённая работа) — это гонка, не баг.

---

## 4. Что надо сделать (TODO)

- [x] **Закоммитить изменения** в ветку `sla-planner-zabbix-integration-ebdcf` — коммит `3f577ca`.
- [x] **Создан в Zabbix SLA «ERP»** (slaid=6) с тегами `service: 1С` и `service: SAP` — услуги 1С/SAP приходят в форму «Новая плановая работа».
- [x] **End-to-end push в Zabbix:** плановая работа ERP/1С → `POST /api/works/1/push` → в Zabbix создан `excluded_downtime "SLA Planner #1"` (проверено `sla.get`, работа удалена, артефакт в Zabbix прибран).
- [ ] (опционально) закоммитить `CONTEXT.md`.

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

---

## 6. Как начать диалог с агентом

Примеры первого сообщения в ACP-панели VS Code:

- Быстрый старт: **«Прочитай CONTEXT.md и продолжи работу по TODO.»**
- Конкретная задача: **«Прочитай CONTEXT.md, затем закоммить изменения в ветку sla-planner-zabbix-integration-ebdcf с сообщением "sync: full sync endpoint, tag-based links, prune"».**
- Вопрос: **«Прочитай CONTEXT.md. Как в Zabbix 7.0 связать хост с услугой и почему в проекте используется тег service?»**

Агент работает в том же каталоге `/opt/sla_planner1` — файлы, git и терминал общие с любой другой сессией.
