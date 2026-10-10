---
name: UI-верификация (Playwright E2E)
description: Проверка фронтенда SLA Planner в реальном браузере после правок UI или для отлова устаревшего кода vite — логин через реальный API, «Модель здоровья», граф и детали узла, скриншот. Запускать после фронтенд-изменений и по ловушке №19.
---

# UI-верификация (Playwright E2E)

Проверка живого интерфейса реальным браузером против dev-сервера :3000.
Никаких моков: логин идёт через реальный `/api/auth/login` (правило №1 проекта).

## Требования

- dev-среда поднята (:3000, :8000) — skill «dev-env-up».
- `@playwright/test` — devDependency фронтенда; браузер установлен:
  `npx playwright install chromium` (кладутся в кэш пользователя, в git не попадают).

## Запуск

```bash
cd /opt/sla_planner1
npx playwright test .opencode/skills/ui-verify/scripts/ui-check.spec.ts --reporter=line
```

Скриншот сохраняется в `/tmp/opencode/ui-verify/model-health.png` — показать пользователю
для визуальной проверки.

## Что проверяет `ui-check.spec.ts`

1. Логин `viewer`/`viewer123` через форму (фронт должен получить 200 от `/api/auth/login`).
2. Переход в «Модель здоровья» через меню.
3. Граф отрисован (canvas от vis-network).
4. Панель «Структура модели» видна; клик по узлу дерева → детали появляются под графом.
5. Скриншот для визуальной проверки.

## Ловушки

- **«No tests found»** — не установлен браузер: `npx playwright install chromium`.
- **Ошибка запуска браузера (нет `libnspr4.so`/`libnss3`/`libasound2`)** — системные
  зависимости: `sudo npx playwright install-deps chromium`. Без sudo — временный обход:
  `apt-get download libnspr4 libnss3 libasound2t64`, распаковать через `dpkg -x` в `/tmp/opencode/rootfs`
  и запускать тест с `LD_LIBRARY_PATH=/tmp/opencode/rootfs/usr/lib/x86_64-linux-gnu`.
- **Таймаут на логине** — бэкенд не поднят (проверить `:8000/health`, skill dev-env-up)
  или поменялись учётки (см. AGENTS.md §2.3).
- **Граф пуст (нет canvas)** — в Zabbix нет услуг/моделей в БД сайта: нужен синк
  «Синхр. с Zabbix» (admin) — правило №1, моками не лечить.
- **Vite отдаёт устаревший код** (CONTEXT §5 №19) — перезапустить vite, жёсткий reload;
  тест сам покажет расхождение селекторов/текстов после правок.
- Спеку держать устойчивой к перестановкам: предпочитать роли/placeholder/title,
  а не точные классы.