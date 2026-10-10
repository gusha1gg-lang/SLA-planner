#!/usr/bin/env bash
# Идемпотентный подъём dev-среды SLA Planner: uvicorn (:8000) + vite (:3000).
# Логи: /tmp/opencode/uvicorn.log, /tmp/opencode/vite.log. Zabbix (:8080) поднимается сам.
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
log() { echo "[env-up] $*"; }

is_up() { curl -s -o /dev/null --max-time 2 "$1"; }

if is_up "http://localhost:8000/health"; then
  log "backend уже работает (:8000 health OK)"
else
  log "старт uvicorn…"
  cd "$ROOT/sla_planner/backend" || exit 1
  nohup venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > /tmp/opencode/uvicorn.log 2>&1 &
fi

if is_up "http://localhost:3000"; then
  log "frontend уже работает (:3000)"
else
  log "старт vite…"
  cd "$ROOT" || exit 1
  nohup npm run dev > /tmp/opencode/vite.log 2>&1 &
fi

sleep 4
for u in localhost:3000 localhost:8000/health localhost:8080; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://$u")
  log "$u -> $code"
done
log "готово. Логи: /tmp/opencode/uvicorn.log, /tmp/opencode/vite.log"