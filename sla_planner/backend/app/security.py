"""Security utilities — role checking."""

from functools import wraps
from fastapi import HTTPException

from app.models.user import User


def require_role(*roles: str):
    """Декоратор для проверки роли."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, current_user: User = None, **kwargs):
            if current_user and current_user.role not in roles:
                raise HTTPException(status_code=403, detail=f"Role required: {', '.join(roles)}")
            return await func(*args, current_user=current_user, **kwargs)
        return wrapper
    return decorator
