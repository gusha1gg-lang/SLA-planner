"""Audit log router."""

import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.permissions import P_AUDIT, require_permission

router = APIRouter()


@router.get("/")
async def list_logs(
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_AUDIT)),
):
    """Аудит-лог (право audit; у системных групп его нет, по умолчанию — admin)."""
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
