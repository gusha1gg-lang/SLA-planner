#!/usr/bin/env bash
# DoD перед сдачей: typecheck + pytest на изолированной БД + секреты + git status.
# Останавливается на первом падении. Подробности — в SKILL.md (dod).
set -u
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"

echo "[DoD] 1/4 typecheck (frontend, tsc --noEmit)..."
cd "$ROOT" || exit 1
npm run typecheck || { echo "[DoD] typecheck УПАЛ"; exit 1; }

echo "[DoD] 2/4 pytest на изолированной БД (test_sla.db)..."
cd "$ROOT/sla_planner/backend" || exit 1
DATABASE_URL=sqlite+aiosqlite:///./test_sla.db venv/bin/python -m pytest -q \
  || { echo "[DoD] pytest УПАЛ"; exit 1; }

echo "[DoD] 3/4 сканер секретов (staged)..."
cd "$ROOT" || exit 1
bash .opencode/skills/check-secrets/scripts/scan-secrets.sh \
  || { echo "[DoD] найдены секреты — коммитить нельзя"; exit 1; }

echo "[DoD] 4/4 git status:"
git status --short

echo "[DoD] Готово: typecheck ✓ pytest ✓ секреты ✓"
echo "[DoD] Обнови CONTEXT.md (история/TODO/ловушки) и закоммить всё вместе."