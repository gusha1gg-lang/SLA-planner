---
name: Сдача работы (DoD-чеклист)
description: Запускать перед сдачей/пушем — прогнать Definition of Done проекта: typecheck чистый, pytest зелёный на изолированной БД, сканер секретов, пуш в origin, обновление CONTEXT.
---

# Сдача работы (DoD-чеклист)

Процедура «как сдавать» из AGENTS.md §2, собранная в один запуск + чек-лист.

## Быстрый прогон

```bash
bash .opencode/skills/dod/scripts/dod.sh
```

Скрипт последовательно выполняет и останавливается на первом падении:
1. `npm run typecheck` (fронт, `tsc --noEmit` — должен быть чистый).
2. pytest на изолированной БД: `DATABASE_URL=sqlite+aiosqlite:///./test_sla.db venv/bin/python -m pytest -q`
   (из `sla_planner/backend`; никогда не гонять на dev-БД — тест дропает таблицы).
3. Сканер секретов (`check-secrets`) по staged-изменениям.
4. `git status` — показать, что будет запушено.

## Чек-лист перед коммитом/пушем

- [ ] typecheck чистый, pytest зелёный (или дописан/поправлен тест под изменение).
- [ ] Комментарии и коммиты — по-русски, по делу.
- [ ] Ветка `sla-planner-zabbix-integration-ebdcf`, пуш в origin — всегда, когда есть что.
- [ ] Секретов нет: прогнан `scan-secrets.sh` (см. skill check-secrets).
- [ ] Реальные `.env`, `opencode.json`, `zabbix_dump.json` — не в git (см. check-secrets).
- [ ] Изменения затронули UI — прогнана `ui-verify` (skill), скриншот показан пользователю.
- [ ] `CONTEXT.md` обновлён (история, TODO, ловушки) и запушен.

## Ловушки

- **pytest на `sla.db`** (не test_sla.db) уронит dev-данные — всегда задавать
  `DATABASE_URL=sqlite+aiosqlite:///./test_sla.db`.
- Если origin не пушит по HTTPS-токену — пушить по URL с PAT (токен в файлы не класть).
- После force-push/переписывания истории — старые SHA недействительны, сверять по `git log`.