#!/usr/bin/env bash
# Идемпотентный подъём dev-среды SLA Planner: uvicorn (порт $API_PORT, default 8000) + vite (:3000).
# Логи: /tmp/opencode/uvicorn.log, /tmp/opencode/vite.log. Zabbix (:8080) поднимается сам.
#
# Если :8000 занят чужим сервисом (напр., Django PortalProstoev) — поднимаем на :8001:
#   API_PORT=8001 bash .opencode/skills/dev-env-up/scripts/env-up.sh
# Порт должен совпадать у uvicorn и у прокси vite (он читает API_PORT при старте).
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
log() { echo "[env-up] $*"; }

is_up() { curl -s -o /dev/null --max-time 2 "$1"; }

# Наш бэкенд отвечает /health → {"status":"ok"}; чужой сервис на том же порту — нет.
# (Раньше здесь был обычный curl без -f: Django-404 на :8000 считался «backend работает».)
is_our_backend() { curl -s --max-time 2 "$1/health" | grep -q '"status"'; }

# Выбор порта: явный API_PORT > уже поднятый наш бэкенд (8000, затем 8001) > 8000 по умолчанию.
pick_port() {
  if [ -n "${API_PORT:-}" ]; then echo "$API_PORT"; return; fi
  if is_our_backend http://localhost:8000; then echo 8000; return; fi
  if is_our_backend http://localhost:8001; then echo 8001; return; fi
  echo 8000
}
API_PORT="$(pick_port)"
export API_PORT

if is_our_backend "http://localhost:$API_PORT"; then
  log "backend уже работает (:$API_PORT health OK)"
elif lsof -iTCP:"$API_PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  log "ПОРТ :$API_PORT занят чужим процессом:"
  lsof -iTCP:"$API_PORT" -sTCP:LISTEN -P -n | tail -n +2 | sed 's/^/    /'
  log "решение: API_PORT=8001 bash $0   (и vite должен быть запущен с тем же API_PORT)"
  exit 1
else
  log "старт uvicorn (:$API_PORT)…"
  cd "$ROOT/sla_planner/backend" || exit 1
  nohup venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port "$API_PORT" > /tmp/opencode/uvicorn.log 2>&1 &
fi

if is_up "http://localhost:3000"; then
  log "frontend уже работает (:3000); прокси настроен при его старте на :$API_PORT"
  log "если vite поднимался с другим API_PORT — перезапустите: lsof -ti:3000 | xargs kill && bash $0"
else
  log "старт vite (прокси /api → :$API_PORT)…"
  cd "$ROOT" || exit 1
  nohup npm run dev > /tmp/opencode/vite.log 2>&1 &
fi

sleep 5
for u in "localhost:3000" "localhost:$API_PORT/health" "localhost:8080"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://$u")
  log "$u -> $code"
done
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3000/health")
log "прокси vite /health -> $code (должно быть 200 от бэкенда :$API_PORT)"
log "готово. Логи: /tmp/opencode/uvicorn.log, /tmp/opencode/vite.log"
