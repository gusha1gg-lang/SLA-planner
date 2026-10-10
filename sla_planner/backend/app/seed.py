"""Bootstrap users for SLA Planner.

Создаёт ТОЛЬКО пользователей (admin/planner/viewer) — без мок-SLA/услуг/работ:
бизнес-данные приходят исключительно из Zabbix (см. AGENTS.md, правило 1).
Скрипт идемпотентный: уже существующие пользователи не перезаписываются.

Usage:
    cd sla_planner/backend
    python -m app.seed
"""

import asyncio

from sqlalchemy import select

from app.database import async_session, init_db
from app.models.user import User
from app.services.auth import hash_password

DEFAULT_USERS = [
    ("admin", "admin123", "admin"),
    ("planner", "planner123", "planner"),
    ("viewer", "viewer123", "viewer"),
]


async def seed():
    """Создать дефолтных пользователей, если их ещё нет."""
    await init_db()

    created: list[str] = []
    skipped: list[str] = []
    async with async_session() as session:
        for username, password, role in DEFAULT_USERS:
            existing = (
                await session.execute(select(User).where(User.username == username))
            ).scalar_one_or_none()
            if existing:
                skipped.append(username)
                continue
            session.add(
                User(
                    username=username,
                    password_hash=hash_password(password),
                    role=role,
                    is_active=True,
                )
            )
            created.append(username)
        await session.commit()

    print("✅ Seed users completed")
    print(f"   created: {', '.join(created) or '—'}")
    print(f"   skipped (already exist): {', '.join(skipped) or '—'}")


if __name__ == "__main__":
    asyncio.run(seed())
