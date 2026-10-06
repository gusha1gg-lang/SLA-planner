"""SLA router — list, sync from Zabbix."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.sla import SLA
from app.models.user import User
from app.routers.auth import get_current_user
from app.models.sla_service_link import SlaServiceLink
from app.services.sync import sync_slas, sync_sla_service_links, sla_service_tags

router = APIRouter()


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
    current_user: User = Depends(get_current_user),
):
    """Синхронизировать SLA из Zabbix (+ пересобрать связи)."""
    if current_user.role != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Only admin can sync")
    
    count = await sync_slas(db)
    links = await sync_sla_service_links(db)
    return {"synced": count, "links": links}
