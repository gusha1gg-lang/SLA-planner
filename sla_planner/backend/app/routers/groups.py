"""Groups router — управление группами и их правами (роль admin).

Группа — это набор прав (флагов из app.permissions) + состав участников.
Пользователь собирает права из всех своих групп (сумма прав), как в Grafana.
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.group import Group, UserGroup
from app.models.user import User
from app.models.audit_log import AuditLog
from app.permissions import ALL_PERMISSIONS, require_admin

router = APIRouter()


class GroupIn(BaseModel):
    name: str
    description: str = ""
    permissions: list[str] = []
    member_ids: list[int] = []

    @field_validator("permissions")
    @classmethod
    def valid_permissions(cls, v: list[str]) -> list[str]:
        known = set(ALL_PERMISSIONS)
        unknown = [p for p in v if p not in known]
        if unknown:
            raise ValueError(f"Неизвестные права: {unknown}")
        # сохраняем в порядке каталога
        ordered = [p for p in ALL_PERMISSIONS if p in set(v)]
        return ordered


def _group_dict(group: Group, member_ids: list[int] | None = None) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "permissions": json.loads(group.permissions or "[]"),
        "is_system": group.is_system,
        "member_ids": member_ids or [],
        "created_at": group.created_at.isoformat() if group.created_at else None,
    }


async def _group_member_ids(db: AsyncSession, group_id: int) -> list[int]:
    rows = await db.execute(select(UserGroup.user_id).where(UserGroup.group_id == group_id))
    return [row[0] for row in rows.all()]


async def _set_members(db: AsyncSession, group_id: int, member_ids: list[int]) -> None:
    """Перезаписать состав группы (идемпотентно, с проверкой пользователей)."""
    unique_ids = sorted(set(member_ids))
    if unique_ids:
        users = await db.execute(select(User.id).where(User.id.in_(unique_ids)))
        existing = set(users.scalars().all())
        missing = set(unique_ids) - existing
        if missing:
            raise HTTPException(status_code=400, detail=f"Несуществующие пользователи: {sorted(missing)}")

    await db.execute(delete(UserGroup).where(UserGroup.group_id == group_id))
    for uid in unique_ids:
        db.add(UserGroup(user_id=uid, group_id=group_id))


@router.get("/")
async def list_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Список групп с правами и составом (admin only)."""
    result = await db.execute(select(Group).order_by(Group.name))
    groups = result.scalars().all()
    return [_group_dict(g, await _group_member_ids(db, g.id)) for g in groups]


@router.post("/", status_code=201)
async def create_group(
    data: GroupIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Создать группу (admin only)."""
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название группы обязательно")

    existing = await db.execute(select(Group).where(Group.name == name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Группа с таким названием уже есть")

    group = Group(
        name=name,
        description=data.description.strip(),
        permissions=json.dumps(data.permissions, ensure_ascii=False),
        is_system=False,
    )
    db.add(group)
    await db.flush()

    await _set_members(db, group.id, data.member_ids)

    db.add(AuditLog(
        user_id=current_user.id,
        action="create",
        entity_type="group",
        entity_id=group.id,
        payload=f'{{"name": "{name}"}}',
        result="ok",
    ))

    return _group_dict(group, await _group_member_ids(db, group.id))


@router.put("/{group_id}")
async def update_group(
    group_id: int,
    data: GroupIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Обновить группу: имя, описание, права, состав (admin only)."""
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название группы обязательно")

    if name != group.name:
        dup = await db.execute(select(Group).where(Group.name == name))
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Группа с таким названием уже есть")
        group.name = name

    group.description = data.description.strip()
    group.permissions = json.dumps(data.permissions, ensure_ascii=False)

    await _set_members(db, group.id, data.member_ids)

    db.add(AuditLog(
        user_id=current_user.id,
        action="update",
        entity_type="group",
        entity_id=group.id,
        payload=f'{{"name": "{group.name}"}}',
        result="ok",
    ))

    return _group_dict(group, await _group_member_ids(db, group.id))


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Удалить группу. Системные группы (seed) удалить нельзя (admin only)."""
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if group.is_system:
        raise HTTPException(status_code=400, detail="Системную группу удалить нельзя")

    await db.execute(delete(UserGroup).where(UserGroup.group_id == group.id))
    await db.delete(group)

    db.add(AuditLog(
        user_id=current_user.id,
        action="delete",
        entity_type="group",
        entity_id=group_id,
        payload=f'{{"name": "{group.name}"}}',
        result="ok",
    ))

    return {"deleted": True}