"""Services router — list, sync from Zabbix."""

import json
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.service import Service
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.sync import sync_services

router = APIRouter()


@router.get("/")
async def list_services(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список услуг из БД."""
    result = await db.execute(select(Service).order_by(Service.name))
    services = result.scalars().all()
    return [{
        "id": s.id,
        "zabbix_serviceid": s.zabbix_serviceid,
        "name": s.name,
        "parent_zabbix_serviceid": s.parent_zabbix_serviceid,
        "algorithm": s.algorithm,
        "sortorder": s.sortorder,
        "status": s.status,
        "tags": json.loads(s.tags) if s.tags else [],
        "synced_at": s.synced_at.isoformat() if s.synced_at else None,
    } for s in services]


@router.post("/sync")
async def sync(
    db = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Синхронизировать услуги из Zabbix."""
    if current_user.role != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Only admin can sync")
    
    count = await sync_services(db)
    return {"synced": count}
