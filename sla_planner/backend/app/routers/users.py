"""Users router — администрирование пользователей (роль admin).

Пользователь:
  * role="admin" — полные права без групп;
  * role="user" — права приходят из групп (см. app.permissions).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.group import Group, UserGroup
from app.models.audit_log import AuditLog
from app.permissions import require_admin, user_groups
from app.services.auth import hash_password

router = APIRouter()

VALID_ROLES = ("admin", "user")


async def _set_user_groups(db: AsyncSession, user_id: int, group_ids: list[int] | None) -> None:
    """Перезаписать membership пользователя (идемпотентно, с проверкой групп)."""
    if group_ids is None:
        return

    unique_ids = sorted(set(group_ids))
    if unique_ids:
        groups = await db.execute(select(Group.id).where(Group.id.in_(unique_ids)))
        existing = set(groups.scalars().all())
        missing = set(unique_ids) - existing
        if missing:
            raise HTTPException(status_code=400, detail=f"Несуществующие группы: {sorted(missing)}")

    await db.execute(delete(UserGroup).where(UserGroup.user_id == user_id))
    for gid in unique_ids:
        db.add(UserGroup(user_id=user_id, group_id=gid))


@router.get("/")
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Список пользователей (admin only)."""
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    return [{
        "id": u.id,
        "username": u.username,
        "role": u.role,
        "groups": await user_groups(u, db),
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    } for u in users]


@router.post("/", status_code=201)
async def create_user(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Создать пользователя (admin only)."""
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = data.get("role", "user")
    if not username or not password:
        raise HTTPException(status_code=400, detail="username и password обязательны")
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"role должен быть одним из: {', '.join(VALID_ROLES)}")

    existing = await db.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")

    user = User(
        username=username,
        password_hash=hash_password(password),
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    await _set_user_groups(db, user.id, data.get("group_ids"))

    db.add(AuditLog(
        user_id=current_user.id,
        action="create",
        entity_type="user",
        entity_id=user.id,
        payload=f'{{"username": "{username}", "role": "{role}"}}',
        result="ok",
    ))

    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "groups": await user_groups(user, db),
    }


@router.put("/{user_id}")
async def update_user(
    user_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Обновить пользователя: роль, активность, пароль, группы (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if "role" in data:
        if data["role"] not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"role должен быть одним из: {', '.join(VALID_ROLES)}")
        user.role = data["role"]
    if "is_active" in data:
        user.is_active = bool(data["is_active"])
    if "password" in data and data["password"]:
        user.password_hash = hash_password(data["password"])

    await _set_user_groups(db, user.id, data.get("group_ids"))

    db.add(AuditLog(
        user_id=current_user.id,
        action="update",
        entity_type="user",
        entity_id=user.id,
        payload=f'{{"username": "{user.username}", "role": "{user.role}"}}',
        result="ok",
    ))

    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "groups": await user_groups(user, db),
        "is_active": user.is_active,
    }