# SLA Planner

Веб-портал для планирования плановых работ с автоматической интеграцией с Zabbix 7.0.

## Описание

SLA Planner — мост между инженерами и Zabbix. Инженеры планируют техработы (ТО, обновления БД, замена сертификатов) через удобный веб-интерфейс. Портал автоматически создаёт «исключения простоя» (excluded downtime) в Zabbix, чтобы плановый простой не ломал SLA-отчётность.

## Возможности

- **Граф SLA** — визуализация дерева услуг и их привязки к SLA (vis-network)
- **Плановые работы** — создание, редактирование, календарь
- **Push в Zabbix** — автоматическое создание excluded_downtime через sla.update
- **SLA-отчёт** — статистика доступности и исключений
- **Аудит-лог** — кто, когда, что сделал
- **Роли** — admin / planner / viewer
- **Безопасность** — read-only по умолчанию, только sla.update для записи

## Стек

### Backend
- Python 3.11+, FastAPI, SQLAlchemy (async), httpx, Alembic
- SQLite (dev) → PostgreSQL (prod)

### Frontend
- React, TypeScript, Vite, Tailwind CSS, vis-network

## Быстрый старт

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Отредактируйте .env

alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

## Безопасность

- Портал **НЕ** трогает хосты, триггеры, алерты
- Портал **НЕ** имеет доступа к БД Zabbix
- Работает только через JSON-RPC API
- Единственный пишущий метод — `sla.update`
- На проде режим read-only по умолчанию

## Zabbix 7.0 — важные факты

- SLA и Service — **разные** сущности (slaid ≠ serviceid)
- Связь через **теги**: у услуги `tag:"service"`, у SLA `service_tags`
- Авторизация: `Authorization: Bearer <token>` (не `auth` в теле)
- `selectExcludedDowntimes` (camelCase)
- `excluded_downtimes` — массив `{name, period_from, period_to}`, все **строками**, unixtime UTC
- `sla.update` **ПЕРЕЗАПИСЫВАЕТ** весь массив — нужно read-modify-write

## Структура проекта

```
sla_planner/
├── backend/          # FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── models/   # DB models
│   │   ├── schemas/  # Pydantic schemas
│   │   ├── routers/  # API endpoints
│   │   └── services/ # Business logic + Zabbix client
│   ├── alembic/      # DB migrations
│   └── requirements.txt
├── frontend/         # React + TypeScript + Vite
│   ├── src/
│   └── package.json
└── README.md
```
