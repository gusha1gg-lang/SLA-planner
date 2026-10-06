"""Sync router — полная синхронизация с Zabbix (SLA + Services + Links)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.sync import full_sync

router = APIRouter()


@router.post("/full")
async def sync_full(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Полная синхронизация с Zabbix: SLA → услуги → связи.
    Только живые данные: пропавшее в Zabbix удаляется из БД.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can sync")

    result = await full_sync(db)
    return result
