"""Sync router — полная синхронизация с Zabbix (SLA + Services + Links).

Полный синк выполняется в фоне: POST /full отвечает мгновенно (202), а прогресс
и результат отдаёт GET /status. Параллельные синки отклоняются (409).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.models.user import User
from app.permissions import P_SYNC, require_permission
from app.services.sync import get_sync_status, start_full_sync
from app.timeutil import iso_utc

router = APIRouter()


@router.post("/full", status_code=202)
async def sync_full(
    current_user: User = Depends(require_permission(P_SYNC)),
):
    """
    Запустить полный синк с Zabbix в фоне: SLA → услуги → связи.
    Ответ приходит сразу (202), результат ждите через GET /api/sync/status.
    Право: sync.run (у admin оно есть по умолчанию).
    """
    if not start_full_sync():
        raise HTTPException(status_code=409, detail="Синхронизация уже выполняется")
    return {"status": "started"}


@router.get("/status")
async def sync_status(
    current_user: User = Depends(require_permission(P_SYNC)),
):
    """
    Статус фонового синка: idle | running | ok | error | skipped.
    При ok — result {slas, services, links}; при error — текст ошибки.
    Право: sync.run.
    """
    state = get_sync_status()
    state["started_at"] = iso_utc(state["started_at"])
    state["finished_at"] = iso_utc(state["finished_at"])
    return state