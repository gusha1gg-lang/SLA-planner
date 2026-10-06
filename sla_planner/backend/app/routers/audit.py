"""Audit log router."""

import json
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.routers.auth import get_current_user

router = APIRouter()


@router.get("/")
async def list_logs(
    limit: int = 100,
    offset: int = 0,
    db = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Аудит-лог (только для admin)."""
    if current_user.role != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Only admin can view audit logs")
    
    result = await db.execute(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    logs = result.scalars().all()
    return [{
        "id": log.id,
        "user_id": log.user_id,
        "action": log.action,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "payload": json.loads(log.payload) if log.payload else {},
        "result": log.result,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    } for log in logs]
