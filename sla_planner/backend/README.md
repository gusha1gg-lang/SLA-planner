# SLA Planner — Backend

## Структура

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app, роутеры
│   ├── config.py            # Настройки (env)
│   ├── database.py          # SQLAlchemy async engine
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── sla.py
│   │   ├── service.py
│   │   ├── planned_work.py
│   │   └── audit_log.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── sla.py
│   │   ├── planned_work.py
│   │   └── audit.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── sla.py
│   │   ├── services.py
│   │   ├── planned_works.py
│   │   ├── audit.py
│   │   └── users.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── zabbix_client.py  # JSON-RPC клиент
│   │   ├── sync.py           # Синхронизация SLA/Services
│   │   └── auth.py           # JWT auth
│   └── security.py
├── alembic/
│   ├── env.py
│   └── versions/
├── alembic.ini
├── requirements.txt
└── .env.example
```

## Быстрый старт

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Настройте .env

# Инициализация БД
alembic upgrade head

# Запуск
uvicorn app.main:app --reload --port 8000
```
