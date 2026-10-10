"""Bootstrap пользователей и системных групп для SLA Planner.

Модель прав в стиле Grafana (см. app.permissions):
  * role="admin" — полные права без групп (admin/admin123);
  * role="user" — права приходят из групп; системные группы:
      «Планировщики» (создание/правка работ, исключения простоя),
      «Наблюдатели» (только просмотр).

Демо-пользователи planner/viewer из старых ролей переводятся в role="user"
и добавляются в соответствующие системные группы. Скрипт идемпотентный:
повторные запуски ничего не дублируют.

Бизнес-данные (SLA/услуги/работы) скрипт НЕ создаёт — они приходят из Zabbix
(см. AGENTS.md, правило 1).

Usage:
    cd sla_planner/backend
    python -m app.seed
"""

import asyncio
import json

from sqlalchemy import select

from app.database import async_session, init_db
from app.models.user import User
from app.models.group import Group, UserGroup
from app.permissions import GROUP_PLANNERS, GROUP_VIEWERS
from app.services.auth import hash_password

DEFAULT_USERS = [
    # username, password, role, системная группа (для role="user")
    ("admin", "admin123", "admin", None),
    ("planner", "planner123", "user", "Планировщики"),
    ("viewer", "viewer123", "user", "Наблюдатели"),
]

SYSTEM_GROUPS = [
    ("Планировщики", "Создание и управление плановыми работами, исключения простоя SLA", GROUP_PLANNERS),
    ("Наблюдатели", "Только просмотр: дашборд, модель здоровья, работы, отчёты", GROUP_VIEWERS),
]

# Соответствие старых ролей системным группам при конвертации
LEGACY_ROLE_TO_GROUP = {"planner": "Планировщики", "viewer": "Наблюдатели"}


async def _ensure_groups(session) -> dict[str, Group]:
    """Создать системные группы, если их ещё нет. Возвращает {имя: Group}."""
    groups: dict[str, Group] = {}
    for name, description, perms in SYSTEM_GROUPS:
        existing = (
            await session.execute(select(Group).where(Group.name == name))
        ).scalar_one_or_none()
        if existing:
            groups[name] = existing
            continue
        group = Group(
            name=name,
            description=description,
            permissions=json.dumps(perms, ensure_ascii=False),
            is_system=True,
        )
        session.add(group)
        await session.flush()
        groups[name] = group
    return groups


async def _ensure_membership(session, user_id: int, group: Group) -> bool:
    """Добавить пользователя в группу, если его там ещё нет."""
    existing = (
        await session.execute(
            select(UserGroup).where(
                UserGroup.user_id == user_id,
                UserGroup.group_id == group.id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return False
    session.add(UserGroup(user_id=user_id, group_id=group.id))
    return True


async def seed():
    """Создать системные группы и дефолтных пользователей (идемпотентно)."""
    await init_db()

    created: list[str] = []
    converted: list[str] = []
    memberships = 0

    async with async_session() as session:
        groups = await _ensure_groups(session)

        for username, password, role, group_name in DEFAULT_USERS:
            user = (
                await session.execute(select(User).where(User.username == username))
            ).scalar_one_or_none()

            if user is None:
                user = User(
                    username=username,
                    password_hash=hash_password(password),
                    role=role,
                    is_active=True,
                )
                session.add(user)
                await session.flush()
                created.append(username)

            # Конвертация старых ролей planner/viewer → user + системная группа
            if user.role in LEGACY_ROLE_TO_GROUP:
                target = LEGACY_ROLE_TO_GROUP[user.role]
                user.role = "user"
                converted.append(f"{username} → user + «{target}»")
                group_name = target

            if group_name and group_name in groups:
                if await _ensure_membership(session, user.id, groups[group_name]):
                    memberships += 1

        await session.commit()

    print(f"Пользователи созданы: {created or 'нет'}")
    print(f"Конвертировано ролей: {converted or 'нет'}")
    print(f"Членств добавлено: {memberships}")


if __name__ == "__main__":
    asyncio.run(seed())