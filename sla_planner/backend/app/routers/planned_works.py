"""Planned Works router — CRUD + push to Zabbix."""

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.planned_work import PlannedWork
from app.models.audit_log import AuditLog
from app.models.sla import SLA
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.zabbix_client import zabbix_client, ZabbixError

router = APIRouter()


@router.get("/")
async def list_works(
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список плановых работ."""
    query = select(PlannedWork)
    if status_filter:
        query = query.where(PlannedWork.status == status_filter)
    query = query.order_by(PlannedWork.created_at.desc())
    
    result = await db.execute(query)
    works = result.scalars().all()
    return [work_to_dict(w) for w in works]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_work(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создать плановую работу."""
    if current_user.role not in ("admin", "planner"):
        raise HTTPException(status_code=403, detail="Only admin/planner can create works")
    
    work = PlannedWork(
        title=data["title"],
        description=data.get("description", ""),
        service_id=data["service_id"],
        sla_id=data["sla_id"],
        started_at=datetime.fromisoformat(data["started_at"]),
        ended_at=datetime.fromisoformat(data["ended_at"]),
        status="draft",
        downtime_marker=f"SLA Planner #pending",
        downtime_period_from=str(int(datetime.fromisoformat(data["started_at"]).timestamp())),
        downtime_period_to=str(int(datetime.fromisoformat(data["ended_at"]).timestamp())),
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    db.add(work)
    await db.flush()
    
    work.downtime_marker = f"SLA Planner #{work.id}"
    
    # Audit
    db.add(AuditLog(
        user_id=current_user.id,
        action="create",
        entity_type="planned_work",
        entity_id=work.id,
        payload=json.dumps({"title": work.title}),
        result="ok",
    ))
    
    return work_to_dict(work)


async def _reconcile_zabbix_window(work: PlannedWork, sla: SLA, stale_names: list[str] | None = None) -> None:
    """Идемпотентно синхронизировать окно работы в Zabbix.

    Удаляет устаревшие записи (маркер `SLA Planner #<id>` + переданные имена,
    например старый заголовок после переименования) и добавляет актуальное окно
    с текущим заголовком работы.
    """
    await zabbix_client.remove_excluded_downtime(
        slaid=sla.zabbix_slaid,
        downtime_name=work.downtime_marker,
    )
    for stale in stale_names or []:
        await zabbix_client.remove_excluded_downtime(
            slaid=sla.zabbix_slaid,
            downtime_name=stale,
        )
    await zabbix_client.add_excluded_downtime(
        slaid=sla.zabbix_slaid,
        name=work.title,
        period_from=work.downtime_period_from,
        period_to=work.downtime_period_to,
    )


@router.put("/{work_id}")
async def update_work(
    work_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Обновить плановую работу (сохраняет изменения).

    Если работа уже запланирована (окно есть в Zabbix), правки автоматически
    прокатываются в Zabbix: старое окно (старый заголовок/период) заменяется новым.
    """
    if current_user.role not in ("admin", "planner"):
        raise HTTPException(status_code=403, detail="Only admin/planner can update works")

    result = await db.execute(select(PlannedWork).where(PlannedWork.id == work_id))
    work = result.scalar_one_or_none()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")

    old_title = work.title
    old_sla_id = work.sla_id

    if data.get("title"):
        work.title = data["title"]
    if "description" in data:
        work.description = data.get("description", "")

    sla_id = data.get("sla_id")
    service_id = data.get("service_id")
    if sla_id is not None:
        work.sla_id = sla_id
    if service_id is not None:
        work.service_id = service_id

    # Пересчитываем период простоя, если изменились даты
    started_at = data.get("started_at")
    ended_at = data.get("ended_at")
    if started_at:
        start_dt = datetime.fromisoformat(started_at)
        work.started_at = start_dt
        work.downtime_period_from = str(int(start_dt.timestamp()))
    if ended_at:
        end_dt = datetime.fromisoformat(ended_at)
        work.ended_at = end_dt
        work.downtime_period_to = str(int(end_dt.timestamp()))

    work.updated_by = current_user.id

    # Запланированная работа уже оставила окно в Zabbix — нужно его обновить
    # (иначе в Zabbix останется старый заголовок/период).
    if work.status == "planned":
        sla_result = await db.execute(select(SLA).where(SLA.id == work.sla_id))
        sla = sla_result.scalar_one_or_none()
        if not sla:
            raise HTTPException(status_code=404, detail="SLA not found")
        try:
            # Если работу перенесли на другой SLA — убираем старое окно оттуда
            if old_sla_id != work.sla_id:
                old_sla_result = await db.execute(select(SLA).where(SLA.id == old_sla_id))
                old_sla = old_sla_result.scalar_one_or_none()
                if old_sla:
                    await zabbix_client.remove_excluded_downtime(
                        slaid=old_sla.zabbix_slaid,
                        downtime_name=work.downtime_marker,
                    )
                    await zabbix_client.remove_excluded_downtime(
                        slaid=old_sla.zabbix_slaid,
                        downtime_name=old_title,
                    )
            await _reconcile_zabbix_window(work, sla, stale_names=[old_title])
            work.sync_error = None
        except ZabbixError as e:
            # При сбое get_db откатит изменения — в Zabbix и БД останется старое состояние
            db.add(AuditLog(
                user_id=current_user.id,
                action="update",
                entity_type="planned_work",
                entity_id=work.id,
                payload=json.dumps({"error": str(e), "title": work.title}),
                result="error",
            ))
            raise HTTPException(status_code=502, detail=str(e))

    db.add(AuditLog(
        user_id=current_user.id,
        action="update",
        entity_type="planned_work",
        entity_id=work.id,
        payload=json.dumps({"title": work.title}),
        result="ok",
    ))

    return work_to_dict(work)


@router.post("/{work_id}/push")
async def push_to_zabbix(
    work_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Отправить исключение простоя в Zabbix.
    
    Read-modify-write:
    1. Получить текущие excluded_downtimes из Zabbix
    2. Добавить окно работы
    3. sla.update с полным массивом
    """
    if current_user.role not in ("admin", "planner"):
        raise HTTPException(status_code=403, detail="Only admin/planner can push to Zabbix")
    
    result = await db.execute(select(PlannedWork).where(PlannedWork.id == work_id))
    work = result.scalar_one_or_none()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    
    # Получить SLA для zabbix_slaid
    sla_result = await db.execute(select(SLA).where(SLA.id == work.sla_id))
    sla = sla_result.scalar_one_or_none()
    if not sla:
        raise HTTPException(status_code=404, detail="SLA not found")
    
    try:
        await _reconcile_zabbix_window(work, sla, stale_names=[work.title])
        work.status = "planned"
        work.sync_error = None
        
        # Audit
        db.add(AuditLog(
            user_id=current_user.id,
            action="sync",
            entity_type="planned_work",
            entity_id=work.id,
            payload=json.dumps({"zabbix_slaid": sla.zabbix_slaid}),
            result="ok",
        ))
        
        return {"success": True, "message": "Excluded downtime added to Zabbix"}
    
    except ZabbixError as e:
        work.status = "sync_error"
        work.sync_error = str(e)
        
        db.add(AuditLog(
            user_id=current_user.id,
            action="sync",
            entity_type="planned_work",
            entity_id=work.id,
            payload=json.dumps({"error": str(e)}),
            result="error",
        ))
        
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/{work_id}")
async def delete_work(
    work_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Удалить плановую работу."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete works")
    
    result = await db.execute(select(PlannedWork).where(PlannedWork.id == work_id))
    work = result.scalar_one_or_none()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    
    await db.delete(work)
    
    db.add(AuditLog(
        user_id=current_user.id,
        action="delete",
        entity_type="planned_work",
        entity_id=work_id,
        payload=json.dumps({"title": work.title}),
        result="ok",
    ))
    
    return {"deleted": True}


def work_to_dict(w: PlannedWork) -> dict:
    return {
        "id": w.id,
        "title": w.title,
        "description": w.description,
        "service_id": w.service_id,
        "sla_id": w.sla_id,
        "started_at": w.started_at.isoformat() if w.started_at else None,
        "ended_at": w.ended_at.isoformat() if w.ended_at else None,
        "status": w.status,
        "downtime_marker": w.downtime_marker,
        "downtime_period_from": w.downtime_period_from,
        "downtime_period_to": w.downtime_period_to,
        "sync_error": w.sync_error,
        "created_by": w.created_by,
        "created_at": w.created_at.isoformat() if w.created_at else None,
    }
