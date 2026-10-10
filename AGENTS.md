# AGENTS.md — правила работы для ИИ-агентов

> Этот файл читается агентами автоматически при старте работы в репозитории.
> **Память и история проекта — `CONTEXT.md`** (в git): в начале сессии прочитай его целиком,
> в конце — обнови и закоммить. Промпты для диалога с агентом — `PROMPT.md`.

---

## 1. Проект

**SLA Planner** — веб-портал планирования работ с SLA-контрактами.

| Компонент | Технология | Порт | Запуск |
|---|---|---|---|
| Frontend | React + Vite + TypeScript | :3000 | `npm run dev` (vite, proxy `/api` → :8000) |
| Backend | Python + FastAPI + SQLAlchemy (async) | :8000 | `venv/bin/uvicorn app.main:app --reload` (из `sla_planner/backend`) |
| Тестовый Zabbix | Zabbix 7.0 (docker) | :8080 | стартует сам |
| БД сайта | SQLite | — | `sla_planner/backend/sla_planner.db` |

Сайт живёт на реальной (прод-подобной) структуре: на тестовом Zabbix **67 SLA / 711 услуг / 68 моделей здоровья**.
Пользователь тестирует UI вживую — **не ломать рабочее состояние, сайт должен оставаться доступным**.

## 2. Обязательные правила

1. **Только живые данные из Zabbix.** Моки и seed-данные запрещены и удалены. `api.*` во фронтенде
   всегда ходит в реальный бэкенд.
2. **Прод-Zabbix не трогать** — вся работа только с тестовым `localhost:8080`.
3. **Логин через query params:** `POST /api/auth/login?username=...&password=...` → в ответе
   поле `access_token` (не `token`). Пользователи: `admin/admin123` (admin), `planner/planner123`,
   `viewer/viewer123`.
4. **Тесты — только на изолированной БД.** `tests/test_api.py` дропает все таблицы в БД из
   `DATABASE_URL`!
   ```bash
   cd sla_planner/backend
   DATABASE_URL=sqlite+aiosqlite:///./test_sla.db venv/bin/python -m pytest
   ```
   (`venv` в `backend/` уже создан; тестовые БД класть в каталог backend, не в /tmp.)
5. **Память между чатами — `CONTEXT.md`** (хранится в git): прочитал в начале сессии → обновил
   в конце (история, TODO, ловушки) → закоммитил и запушлил.
6. **Ветка `sla-planner-zabbix-integration-ebdcf`.** Коммиты по делу. Пуш в origin — всегда, когда
   есть что запушить («всегда пуш, если считаешь нужным»). Если origin не пушит напрямую — пушить
   по URL с PAT (токен в файлы репо НЕ класть).
7. **Перед сдачей:** `npx tsc --noEmit` (должен быть чистый) + pytest (зелёный).
8. **Комментарии и сообщения в стиле проекта** (русский, по делу).

## 3. Поднять dev-среду (после перезагрузки машины)

```bash
cd /opt/sla_planner1/sla_planner/backend && venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
cd /opt/sla_planner1 && npm run dev &
```

Проверка: `curl -s localhost:3000` и `curl -s localhost:8000/health` дают 200.
Логи: `/tmp/opencode/uvicorn.log`, `/tmp/opencode/vite.log`.

## 4. Ключевые ловушки (подробности — CONTEXT.md §5)

- **Zabbix 7.0:** авторизация только `Authorization: Bearer <token>` (поле `auth` в теле не работает);
  `service.get` НЕ отдаёт `parent_serviceid` — бери из `parents[0]["serviceid"]` (запрос с `selectParents`);
  `service.update` принимает `parents: [{"serviceid": ...}]`; `sla.update` **перезаписывает
  excluded_downtimes целиком** (read-modify-write); `period_from`/`period_to` — строки unixtime UTC.
- **`get_db` коммитит после формирования ответа** (teardown dependency): сразу после PUT/DELETE
  повторный GET может на мгновение видеть старое состояние — это гонка, не баг.
- **vis-network не двигает узлы с `fixed: true`** даже при `dragNodes: true`. Правило: у узлов
  `fixed` не ставить; заморозка/разморозка — только через `interaction.dragNodes`/`dragView`.
- **Мок-токены в localStorage** (`mock-token`/`mock-jwt-token`) AuthContext вычищает при старте —
  это норма (страница логина), а не баг.
- **`service_tags` наружу — всегда `string[]`** (нормализация в `routers/sla.py`).
- **Prune не срабатывает при пустом ответе Zabbix** — это защита от случайного удаления.
- **test_version** проверяет `isinstance(..., bool)`, а не `is True` — локальный `.env` содержит `false`.
- **Кнопка «Синхр. с Zabbix»** (admin) после синка перезагружает страницу (`window.location.reload()`).

## 5. Где что лежит (для быстрой ориентации)

- `src/pages/GraphPage.tsx` — «Модель здоровья»: граф, ручная раскладка, перетаскивание (своя
  реализация через `moveNode`), цвета узлов, режимы просмотра/редактирования.
- `src/api/realClient.ts` — весь HTTP-слой (только реальные запросы, моков нет).
- `sla_planner/backend/app/routers/graph.py` — позиции (`graph_node_positions`) и цвета
  (`graph_node_styles`) графа; `GET/PUT/DELETE /api/graph/...`.
- `sla_planner/backend/app/services/sync.py` + `zabbix_client.py` — синк Zabbix↔сайт (теги, prune, полный синк).
- `sla_planner/backend/tests/test_api.py` — тесты (run см. п.2).
- `CONTEXT.md` — память проекта: история, TODO, ловушки. **Читать в начале, обновлять в конце.**