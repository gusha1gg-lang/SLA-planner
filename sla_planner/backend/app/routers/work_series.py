"""WorkSeries router — цикличные плановые работы (еженедельные серии).

Создание/правка/удаление серии целиком. Вхождения — обычные `planned_works`
со ссылкой `series_id`; при создании/правке серии они генерируются на горизонт
и сразу отправляются в Zabbix (excluded downtime по каждому вхождению).
"""

import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.planned_work import PlannedWork
from app.models.service import Service
from app.models.sla import SLA
from app.models.user import User
from app.models.work_series import WorkSeries
from app.permissions import P_WORKS, P_WORKS_DELETE, P_WORKS_EDIT, require_permission
from app.services.recurrence import (
    delete_series_works,
    ensure_series_occurrences,
    format_weekdays,
    parse_weekdays,
    regenerate_series,
)
from app.timeutil import iso_utc

router = APIRouter()


def _parse_start_time(value) -> str:
    """'H:MM' / 'HH:MM' → 'HH:MM' (МСК)."""
    raw = str(value or "").strip()
    parts = raw.split(":")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Некорректное время начала (ожидается HH:MM)")
    try:
        hh, mm = int(parts[0]), int(parts[1])
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректное время начала (ожидается HH:MM)")
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        raise HTTPException(status_code=400, detail="Некорректное время начала (ожидается HH:MM)")
    return f"{hh:02d}:{mm:02d}"


def _validate_payload(data: dict) -> dict:
    title = str(data.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Название обязательно")
    if data.get("sla_id") is None or data.get("service_id") is None:
        raise HTTPException(status_code=400, detail="SLA и услуга обязательны")

    try:
        weekdays = parse_weekdays(data.get("weekdays"))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Некорректные дни недели")
    if not weekdays:
        raise HTTPException(status_code=400, detail="Выберите хотя бы один день недели")

    try:
        duration = int(data.get("duration_minutes") or 60)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Некорректная длительность")
    if duration <= 0 or duration > 24 * 60:
        raise HTTPException(status_code=400, detail="Длительность должна быть от 1 минуты до 24 часов")

    return {
        "title": title,
        "description": data.get("description") or "",
        "sla_id": int(data["sla_id"]),
        "service_id": int(data["service_id"]),
        "weekdays": weekdays,
        "start_time": _parse_start_time(data.get("start_time")),
        "duration_minutes": duration,
    }


def _series_to_dict(series: WorkSeries, *, occurrence_count: int | None = None,
                    sla_name: str | None = None, service_name: str | None = None) -> dict:
    return {
        "id": series.id,
        "title": series.title,
        "description": series.description,
        "service_id": series.service_id,
        "sla_id": series.sla_id,
        "weekdays": parse_weekdays(series.weekdays),
        "start_time": series.start_time,
        "duration_minutes": series.duration_minutes,
        "active": series.active,
        "occurrence_count": occurrence_count,
        "sla_name": sla_name,
        "service_name": service_name,
        "created_at": iso_utc(series.created_at),
    }


async def _names(db: AsyncSession) -> tuple[dict, dict]:
    slas = (await db.execute(select(SLA))).scalars().all()
    services = (await db.execute(select(Service))).scalars().all()
    return ({s.id: s.name for s in slas}, {sv.id: sv.name for sv in services})


@router.get("/")
async def list_series(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_WORKS)),
):
    """Список цикличных серий (право works)."""
    result = await db.execute(select(WorkSeries).order_by(WorkSeries.created_at.desc()))
    series_list = result.scalars().all()

    counts_rows = await db.execute(
        select(PlannedWork.series_id, func.count())
        .where(PlannedWork.series_id.isnot(None))
        .group_by(PlannedWork.series_id)
    )
    counts = {row[0]: row[1] for row in counts_rows.all()}
    sla_names, service_names = await _names(db)

    return [
        _series_to_dict(
            s,
            occurrence_count=counts.get(s.id, 0),
            sla_name=sla_names.get(s.sla_id),
            service_name=service_names.get(s.service_id),
        )
        for s in series_list
    ]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_series(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_WORKS_EDIT)),
):
    """Создать серию и сгенерировать вхождения на горизонт (право works.edit)."""
    payload = _validate_payload(data)

    sla = (await db.execute(select(SLA).where(SLA.id == payload["sla_id"]))).scalar_one_or_none()
    if not sla:
        raise HTTPException(status_code=404, detail="SLA not found")

    series = WorkSeries(
        title=payload["title"],
        description=payload["description"],
        service_id=payload["service_id"],
        sla_id=payload["sla_id"],
        weekdays=format_weekdays(payload["weekdays"]),
        start_time=payload["start_time"],
        duration_minutes=payload["duration_minutes"],
        active=True,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    db.add(series)
    await db.flush()

    created = await ensure_series_occurrences(db, series)

    db.add(AuditLog(
        user_id=current_user.id,
        action="create",
        entity_type="work_series",
        entity_id=series.id,
        payload=json.dumps({"title": series.title, "occurrences": created}),
        result="ok",
    ))

    sla_names, service_names = await _names(db)
    return {
        **_series_to_dict(
            series,
            occurrence_count=created,
            sla_name=sla_names.get(series.sla_id),
            service_name=service_names.get(series.service_id),
        ),
        "created_occurrences": created,
    }


@router.put("/{series_id}")
async def update_series(
    series_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_WORKS_EDIT)),
):
    """Обновить серию целиком: будущие вхождения пересоздаются (право works.edit)."""
    series = (await db.execute(select(WorkSeries).where(WorkSeries.id == series_id))).scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    payload = _validate_payload(data)
    sla = (await db.execute(select(SLA).where(SLA.id == payload["sla_id"]))).scalar_one_or_none()
    if not sla:
        raise HTTPException(status_code=404, detail="SLA not found")

    series.title = payload["title"]
    series.description = payload["description"]
    series.service_id = payload["service_id"]
    series.sla_id = payload["sla_id"]
    series.weekdays = format_weekdays(payload["weekdays"])
    series.start_time = payload["start_time"]
    series.duration_minutes = payload["duration_minutes"]
    series.updated_by = current_user.id

    created = await regenerate_series(db, series)

    db.add(AuditLog(
        user_id=current_user.id,
        action="update",
        entity_type="work_series",
        entity_id=series.id,
        payload=json.dumps({"title": series.title, "regenerated": created}),
        result="ok",
    ))

    sla_names, service_names = await _names(db)
    return {
        **_series_to_dict(
            series,
            sla_name=sla_names.get(series.sla_id),
            service_name=service_names.get(series.service_id),
        ),
        "created_occurrences": created,
    }


@router.delete("/{series_id}")
async def delete_series(
    series_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_WORKS_DELETE)),
):
    """Удалить серию и все её вхождения (вместе с окнами в Zabbix)."""
    series = (await db.execute(select(WorkSeries).where(WorkSeries.id == series_id))).scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    removed = await delete_series_works(db, series)
    await db.delete(series)

    db.add(AuditLog(
        user_id=current_user.id,
        action="delete",
        entity_type="work_series",
        entity_id=series_id,
        payload=json.dumps({"title": series.title, "occurrences": removed}),
        result="ok",
    ))

    return {"deleted": True, "removed_occurrences": removed}
