#!/usr/bin/env bash
# Сканирует staged-изменения на секреты перед коммитом.
# Выход: 0 — чисто, 1 — найдено (коммитить нельзя).
set -u
cd "$(git rev-parse --show-toplevel)" 2>/dev/null || exit 1
STAGED=$(git diff --cached --name-only)
if [ -z "$STAGED" ]; then
  echo "нет staged-изменений — нечего проверять"
  exit 0
fi

# Типовые паттерны ключей/токенов
PATTERNS='sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,}|AKIA[0-9A-Z]{16}|ZABBIX_API_TOKEN=.{8,}|SECRET_KEY=[A-Za-z0-9@#$%^&*]{20,}'
# Файлы, которые в принципе нельзя стейджить (содержат учётки/дампы)
FORBIDDEN='(^|/)(\.env([^.]|$)|opencode\.json$|zabbix_dump\.json)'

FOUND=0
SELF_NAME=$(basename "$0")
for f in $STAGED; do
  # не сканируем сам скрипт сканера (его паттерны матчатся с собственным текстом)
  [ "$(basename "$f")" = "$SELF_NAME" ] && continue
  if printf '%s' "$f" | grep -qE "$FORBIDDEN"; then
    echo "ЗАПРЕЩЁН к коммиту: $f (env/opencode.json/дамп)"
    FOUND=1
    continue
  fi
  if git show ":$f" 2>/dev/null | grep -nE "$PATTERNS" >/dev/null 2>&1; then
    echo "СЕКРЕТ в $f (строки: $(git show ":$f" 2>/dev/null | grep -nE "$PATTERNS" | cut -d: -f1 | tr '\n' ' ' | sed 's/ $//'))"
    FOUND=1
  fi
done

if [ "$FOUND" = "0" ]; then
  echo "OK: секретов в staged-изменениях не найдено"
fi
exit "$FOUND"