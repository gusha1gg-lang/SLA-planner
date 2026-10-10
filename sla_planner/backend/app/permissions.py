"""Каталог прав и проверки доступа в стиле Grafana.

Модель: две роли —
  * "admin" — полные права всегда, группы не нужны;
  * "user"  — права = объединение прав групп, в которых состоит пользователь.

Права (флаги, которые выдаются группе) двух видов:
  * страницы — что видно в меню и какие данные страницы доступны:
    dashboard, model, works, reports, audit;
  * действия — что можно делать:
    works.edit (создание/редактирование работ + push в Zabbix),
    works.delete (удаление работ),
    sla.edit (исключения простоя SLA),
    graph.edit (редактирование графа: раскладка, цвета),
    sync.run («Синхр. с Zabbix»).

Админ-страницы (Пользователи, Группы, Настройки) доступны только роли admin —
права групп на них не распространяются.
"""

import json

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.group import Group, UserGroup
from app.models.user import User

# ── Страницы ──
P_DASHBOARD = "dashboard"      # Дашборд
P_MODEL = "model"              # Модель здоровья
P_WORKS = "works"              # Плановые работы (просмотр)
P_REPORTS = "reports"          # SLA-отчёт
P_AUDIT = "audit"              # Аудит-лог

# ── Действия ──
P_WORKS_EDIT = "works.edit"    # создание/редактирование работ + push в Zabbix
P_WORKS_DELETE = "works.delete"  # удаление работ
P_SLA_EDIT = "sla.edit"        # исключения простоя SLA (добавление/удаление)
P_GRAPH_EDIT = "graph.edit"    # редактирование графа (раскладка, цвета)
P_SYNC = "sync.run"            # «Синхр. с Zabbix»

ALL_PERMISSIONS = [
    P_DASHBOARD,
    P_MODEL,
    P_WORKS,
    P_REPORTS,
    P_AUDIT,
    P_WORKS_EDIT,
    P_WORKS_DELETE,
    P_SLA_EDIT,
    P_GRAPH_EDIT,
    P_SYNC,
]

# Русские подписи прав (для UI страницы «Группы»)
PERMISSION_LABELS = {
    P_DASHBOARD: "Дашборд",
    P_MODEL: "Модель здоровья",
    P_WORKS: "Плановые работы (просмотр)",
    P_REPORTS: "SLA-отчёт",
    P_AUDIT: "Аудит-лог",
    P_WORKS_EDIT: "Работы: создание/редактирование",
    P_WORKS_DELETE: "Работы: удаление",
    P_SLA_EDIT: "Исключения простоя SLA",
    P_GRAPH_EDIT: "Граф: редактирование",
    P_SYNC: "Синхр. с Zabbix",
}

# Типовые наборы прав для системных групп (seed)
GROUP_PLANNERS = [
    P_DASHBOARD, P_MODEL, P_WORKS, P_REPORTS,
    P_WORKS_EDIT, P_SLA_EDIT,
]
GROUP_VIEWERS = [
    P_DASHBOARD, P_MODEL, P_WORKS, P_REPORTS,
]


async def effective_permissions(user: User, db: AsyncSession) -> set[str]:
    """Права пользователя: admin => все; user => сумма прав его групп."""
    if user.role == "admin":
        return set(ALL_PERMISSIONS)

    rows = await db.execute(
        select(UserGroup.group_id).where(UserGroup.user_id == user.id)
    )
    group_ids = [row[0] for row in rows.all()]
    if not group_ids:
        return set()

    groups = await db.execute(select(Group).where(Group.id.in_(group_ids)))
    perms: set[str] = set()
    for group in groups.scalars().all():
        try:
            perms.update(json.loads(group.permissions or "[]"))
        except ValueError:
            continue
    return perms


async def user_groups(user: User, db: AsyncSession) -> list[dict]:
    """Группы пользователя [{id, name}] для ответов API."""
    rows = await db.execute(
        select(UserGroup.group_id).where(UserGroup.user_id == user.id)
    )
    group_ids = [row[0] for row in rows.all()]
    if not group_ids:
        return []

    groups = await db.execute(
        select(Group).where(Group.id.in_(group_ids)).order_by(Group.name)
    )
    return [{"id": g.id, "name": g.name} for g in groups.scalars().all()]


def require_permission(*required: str):
    """Dependency: admin проходит всегда; user — если имеет хотя бы одно из прав."""

    async def dependency(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        perms = await effective_permissions(current_user, db)
        if current_user.role == "admin" or set(required) & perms:
            return current_user
        labels = ", ".join(PERMISSION_LABELS.get(p, p) for p in required)
        raise HTTPException(status_code=403, detail=f"Недостаточно прав: {labels}")

    return dependency


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency: только роль admin (полные права без групп)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Только администратор")
    return current_user