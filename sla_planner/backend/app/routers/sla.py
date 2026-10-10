"""SLA router — list, sync from Zabbix."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.sla import SLA
from app.models.user import User
from app.routers.auth import get_current_user
from app.models.sla_service_link import SlaServiceLink
from app.permissions import P_SLA_EDIT, P_SYNC, require_permission
from app.services.sync import sync_slas, sync_sla_service_links, sla_service_tags
from app.services.zabbix_client import zabbix_client, ZabbixError

router = APIRouter()


class ExcludedDowntimeIn(BaseModel):
    name: str
    period_from: str
    period_to: str


@router.get("/")
async def list_slas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список SLA из БД."""
    result = await db.execute(select(SLA).order_by(SLA.name))
    slas = result.scalars().all()
    return [{
        "id": s.id,
        "zabbix_slaid": s.zabbix_slaid,
        "name": s.name,
        "slo": s.slo,
        "schedule_type": s.schedule_type,
        "service_tags": sla_service_tags(s),  # string[] для фронта
        "synced_at": s.synced_at.isoformat() if s.synced_at else None,
    } for s in slas]


@router.get("/service-links")
async def service_links(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Связи SLA↔Service из БД (для графа)."""
    result = await db.execute(select(SlaServiceLink))
    links = result.scalars().all()
    return [{"sla_id": l.sla_id, "service_id": l.service_id} for l in links]


@router.post("/sync")
async def sync(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_SYNC)),
):
    """Синхронизировать SLA из Zabbix (+ пересобрать связи). Право: sync.run."""
    count = await sync_slas(db)
    links = await sync_sla_service_links(db)
    return {"synced": count, "links": links}


# ── Живые Excluded Downtimes из Zabbix (только реальные данные) ──

@router.get("/{zabbix_slaid}/excluded-downtimes")
async def sla_excluded_downtimes(
    zabbix_slaid: str,
    current_user: User = Depends(get_current_user),
):
    """Исключения простоя SLA прямо из Zabbix (sla.get + selectExcludedDowntimes)."""
    try:
        sla = await zabbix_client.sla_get_by_id(zabbix_slaid)
    except ZabbixError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return sla.get("excluded_downtimes", [])


@router.post("/{zabbix_slaid}/excluded-downtimes")
async def sla_add_excluded_downtime(
    zabbix_slaid: str,
    data: ExcludedDowntimeIn,
    current_user: User = Depends(require_permission(P_SLA_EDIT)),
):
    """Добавить окно исключения простоя в Zabbix (read-modify-write). Право: sla.edit."""
    try:
        updated = await zabbix_client.add_excluded_downtime(
            slaid=zabbix_slaid,
            name=data.name,
            period_from=data.period_from,
            period_to=data.period_to,
        )
    except ZabbixError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return updated


@router.delete("/{zabbix_slaid}/excluded-downtimes/{downtime_name}")
async def sla_remove_excluded_downtime(
    zabbix_slaid: str,
    downtime_name: str,
    current_user: User = Depends(require_permission(P_SLA_EDIT)),
):
    """Удалить окно исключения простоя из Zabbix по имени. Право: sla.edit."""
    try:
        updated = await zabbix_client.remove_excluded_downtime(zabbix_slaid, downtime_name)
    except ZabbixError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return updated
