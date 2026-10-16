---
name: Поднять dev-среду
description: Поднять dev-окружение SLA Planner после ребута машины или когда frontend/backend не отвечают — запуск uvicorn и vite, проверка health-портов и логов.
---

# Поднять dev-среду SLA Planner

Сценарий: машина перезагружена, либо `localhost:3000` / бэкенд не отвечают.
После ребута docker-Zabbix (:8080) стартует сам, а uvicorn и vite — нет.

**Порт бэкенда = `$API_PORT` (default :8000).** Если :8000 занят чужим сервисом
(Django `/opt/PortalProstoev`) — поднимаем SLA Planner на :8001, см. ловушку №33 в CONTEXT.md.
uvicorn и vite обязаны запуститься с одним и тем же `API_PORT` (прокси vite читает env при старте).

## Быстрый запуск

Из корня репозитория:

```bash
bash .opencode/skills/dev-env-up/scripts/env-up.sh                 # :8000, если он свободен/наш
API_PORT=8001 bash .opencode/skills/dev-env-up/scripts/env-up.sh   # когда :8000 занят чужим
```

Скрипт идемпотентный: сам выбирает порт (занят чужим → подскажет), не трогает уже работающие
процессы, логи пишет в `/tmp/opencode/uvicorn.log` и `/tmp/opencode/vite.log`, в конце показывает
коды `:3000`, `:$API_PORT/health`, `:8080` и **сквозную** проверку `localhost:3000/health`
(это единственный признак того, что прокси дошёл до НАШЕГО бэкенда: `{"status":"ok"}`).

## Ручной запуск (если скрипт не подходит)

```bash
# Backend (из sla_planner/backend)
API_PORT=${API_PORT:-8000} venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port ${API_PORT:-8000} > /tmp/opencode/uvicorn.log 2>&1 &
# Frontend (из корня репо) — тот же порт!
API_PORT=${API_PORT:-8000} npm run dev > /tmp/opencode/vite.log 2>&1 &
```

## Проверка

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000                    # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:${API_PORT:-8000}/health # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health              # 200 и {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080                     # 200 (Zabbix)
```

## Ловушки

- **Порт занят** — перед стартом проверить `pgrep -af "uvicorn|vite"`; старые процессы
  убивать (`kill <pid>`), иначе vite падает или отдаёт старый билд.
- **Vite отдаёт устаревший код** (пр. конт. §5 №19): после серии быстрых правок одного файла
  проверить свежесть через прямой URL (`curl -s localhost:3000/src/pages/GraphPage.tsx | grep -c "<маркер>"`);
  лечить перезапуском vite + пользователю жёсткий reload (Ctrl+Shift+R).
- **Тестовые БД** — pytest запускать только на изолированной БД (см. skill/правило в CONTEXT),
  в `/tmp/opencode` БД не класть.
- Учётные данные бэкенда — в `sla_planner/backend/.env` (не в git).