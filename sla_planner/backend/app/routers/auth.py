"""Auth router — login, token, me."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user  # re-export для обратной совместимости
from app.models.user import User
from app.permissions import effective_permissions, user_groups
from app.services.auth import verify_password, create_access_token

router = APIRouter()


async def user_payload(user: User, db: AsyncSession) -> dict:
    """Пользователь для ответов API: роль + права (admin => все) + группы."""
    perms = await effective_permissions(user, db)
    groups = await user_groups(user, db)
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "groups": groups,
        "permissions": sorted(perms),
        "is_active": user.is_active,
    }


@router.post("/login")
async def login(username: str, password: str, db: AsyncSession = Depends(get_db)):
    """Логин по username/password → JWT token + права/группы пользователя."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": await user_payload(user, db),
    }


@router.get("/me")
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Текущий пользователь (роль, права, группы)."""
    return await user_payload(current_user, db)