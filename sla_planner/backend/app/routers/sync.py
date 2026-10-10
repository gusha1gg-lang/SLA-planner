"""Sync router — полная синхронизация с Zabbix (SLA + Services + Links)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.permissions import P_SYNC, require_permission
from app.services.sync import full_sync

router = APIRouter()


@router.post("/full")
async def sync_full(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_SYNC)),
):
    """
    Полная синхронизация с Zabbix: SLA → услуги → связи.
    Только живые данные: пропавшее в Zabbix удаляется из БД.
    Право: sync.run (у admin оно есть по умолчанию).
    """
    result = await full_sync(db)
    return result