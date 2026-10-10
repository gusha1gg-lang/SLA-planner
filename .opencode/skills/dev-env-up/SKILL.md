---
name: Поднять dev-среду
description: Поднять dev-окружение SLA Planner после ребута машины или когда frontend/backend не отвечают — запуск uvicorn и vite, проверка health-портов и логов.
---

# Поднять dev-среду SLA Planner

Сценарий: машина перезагружена, либо `localhost:3000` / `localhost:8000` не отвечают.
После ребута docker-Zabbix (:8080) стартует сам, а uvicorn и vite — нет.

## Быстрый запуск

Из корня репозитория:

```bash
bash .opencode/skills/dev-env-up/scripts/env-up.sh
```

Скрипт идемпотентный: не трогает уже работающие процессы, логи пишет в
`/tmp/opencode/uvicorn.log` и `/tmp/opencode/vite.log`, в конце показывает коды
ответов `:3000`, `:8000/health`, `:8080`.

## Ручной запуск (если скрипт не подходит)

```bash
# Backend (из sla_planner/backend)
venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > /tmp/opencode/uvicorn.log 2>&1 &
# Frontend (из корня репо)
npm run dev > /tmp/opencode/vite.log 2>&1 &
```

## Проверка

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000     # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/health  # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080     # 200 (Zabbix)
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