"""Цикличные плановые работы: генерация и продление вхождений серии.

Модель повторения — еженедельно по выбранным дням недели (`WorkSeries`).
Zabbix `excluded_downtimes` не поддерживают RRULE: там просто список конкретных
окон, поэтому «каждую субботу» разворачивается в отдельные окна на горизонт
`WORK_SERIES_HORIZON_WEEKS` вперёд. Фоновый планировщик периодически продлевает
горизонт (запускается из lifespan, см. app/main.py).
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.planned_work import PlannedWork
from app.models.sla import SLA
from app.models.work_series import WorkSeries
from app.services.work_push import reconcile_zabbix_window, remove_zabbix_window
from app.services.zabbix_client import ZabbixError

logger = logging.getLogger(__name__)

# Москва — UTC+3 круглый год (без DST). Если есть tzdata — берём зону,
# иначе фиксированное смещение.
try:
    MSK = ZoneInfo(settings.DEFAULT_TIMEZONE or "Europe/Moscow")
except Exception:  # pragma: no cover - окружение без tzdata
    MSK = timezone(timedelta(hours=3))


def parse_weekdays(value) -> list[int]:
    """Строка "0,5" или список [0, 5] → отсортированный список (0=Пн..6=Вс)."""
    if isinstance(value, (list, tuple, set)):
        raw_parts = [str(v) for v in value]
    else:
        raw_parts = (str(value or "")).split(",")

    days: list[int] = []
    for part in raw_parts:
        part = part.strip()
        if part == "":
            continue
        day = int(part)
        if day < 0 or day > 6:
            raise ValueError(f"Недопустимый день недели: {day}")
        if day not in days:
            days.append(day)
    return sorted(days)


def format_weekdays(days) -> str:
    return ",".join(str(int(d)) for d in sorted({int(x) for x in days}))


def occurrence_starts(series: WorkSeries, *, now: datetime, horizon_weeks: int) -> list[datetime]:
    """Моменты начала вхождений (aware UTC) в окне (now, now + horizon_weeks]."""
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    now_msk = now.astimezone(MSK)

    weekdays = set(parse_weekdays(series.weekdays))
    if not weekdays:
        return []
    hh, mm = (int(x) for x in series.start_time.split(":")[:2])

    starts: list[datetime] = []
    day = now_msk.date()
    last = day + timedelta(weeks=max(0, horizon_weeks))
    while day <= last:
        if day.weekday() in weekdays:
            start_msk = datetime(day.year, day.month, day.day, hh, mm, tzinfo=MSK)
            start_utc = start_msk.astimezone(timezone.utc)
            if start_utc > now:
                starts.append(start_utc)
        day += timedelta(days=1)
    return starts


def _msk_date_key(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(MSK).strftime("%Y-%m-%d")


async def _get_sla(db: AsyncSession, sla_id: int) -> SLA | None:
    result = await db.execute(select(SLA).where(SLA.id == sla_id))
    return result.scalar_one_or_none()


async def _create_occurrence(
    db: AsyncSession, series: WorkSeries, start_utc: datetime, push: bool
) -> PlannedWork:
    end_utc = start_utc + timedelta(minutes=series.duration_minutes or 60)
    work = PlannedWork(
        title=series.title,
        description=series.description or "",
        service_id=series.service_id,
        sla_id=series.sla_id,
        started_at=start_utc,
        ended_at=end_utc,
        status="draft",
        series_id=series.id,
        downtime_marker="SLA Planner #pending",
        downtime_period_from=str(int(start_utc.timestamp())),
        downtime_period_to=str(int(end_utc.timestamp())),
        created_by=series.created_by,
        updated_by=series.updated_by or series.created_by,
    )
    db.add(work)
    await db.flush()
    work.downtime_marker = f"SLA Planner #{work.id}"

    if push:
        sla = await _get_sla(db, series.sla_id)
        if sla is not None:
            try:
                await reconcile_zabbix_window(work, sla)
                work.status = "planned"
                work.sync_error = None
            except ZabbixError as e:
                work.status = "sync_error"
                work.sync_error = str(e)
    return work


async def ensure_series_occurrences(
    db: AsyncSession,
    series: WorkSeries,
    *,
    horizon_weeks: int | None = None,
    now: datetime | None = None,
    push: bool = True,
) -> int:
    """Досоздать недостающие вхождения серии на горизонт. Возвращает число новых."""
    horizon_weeks = (
        horizon_weeks if horizon_weeks is not None else settings.WORK_SERIES_HORIZON_WEEKS
    )
    now = now or datetime.now(timezone.utc)

    existing = await db.execute(
        select(PlannedWork).where(PlannedWork.series_id == series.id)
    )
    existing_keys = {_msk_date_key(w.started_at) for w in existing.scalars().all()}

    created = 0
    for start in occurrence_starts(series, now=now, horizon_weeks=horizon_weeks):
        key = _msk_date_key(start)
        if key in existing_keys:
            continue
        await _create_occurrence(db, series, start, push)
        existing_keys.add(key)
        created += 1
    return created


async def regenerate_series(
    db: AsyncSession, series: WorkSeries, *, now: datetime | None = None
) -> int:
    """Пересоздать будущие вхождения серии (после правки шаблона).

    Прошлые вхождения оставляем как историю; будущие — убираем (вместе с окнами
    в Zabbix) и генерируем заново по новым параметрам.
    """
    now = now or datetime.now(timezone.utc)
    result = await db.execute(
        select(PlannedWork).where(PlannedWork.series_id == series.id)
    )
    works = result.scalars().all()
    sla = await _get_sla(db, series.sla_id) if works else None

    for work in works:
        start = work.started_at
        if start is not None and start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if start is None or start <= now:
            continue
        if sla is not None:
            try:
                await remove_zabbix_window(work, sla)
            except ZabbixError as e:  # Zabbix — внешняя система: не роняем правку
                logger.warning("Series %s: не удалось убрать окно работы %s: %s", series.id, work.id, e)
        await db.delete(work)
    await db.flush()

    return await ensure_series_occurrences(db, series, now=now)


async def delete_series_works(db: AsyncSession, series: WorkSeries) -> int:
    """Удалить все вхождения серии (и их окна в Zabbix)."""
    result = await db.execute(
        select(PlannedWork).where(PlannedWork.series_id == series.id)
    )
    works = result.scalars().all()
    sla = await _get_sla(db, series.sla_id) if works else None

    for work in works:
        if sla is not None:
            try:
                await remove_zabbix_window(work, sla)
            except ZabbixError as e:
                logger.warning("Series %s: не удалось убрать окно работы %s: %s", series.id, work.id, e)
        await db.delete(work)
    await db.flush()
    return len(works)


# ── Фоновый планировщик продления серий ──

_series_task: asyncio.Task | None = None


async def extend_all_series() -> int:
    """Продлить горизонт у всех активных серий. Возвращает число новых вхождений."""
    total = 0
    async with async_session() as db:
        result = await db.execute(select(WorkSeries).where(WorkSeries.active.is_(True)))
        for series in result.scalars().all():
            try:
                total += await ensure_series_occurrences(db, series)
            except Exception:  # одна битая серия не должна ронять остальные
                logger.exception("Series %s: не удалось продлить", series.id)
        await db.commit()
    if total:
        logger.info("Планировщик серий: добавлено вхождений — %s", total)
    return total


async def _series_loop(interval_seconds: float) -> None:
    while True:
        try:
            await extend_all_series()
        except Exception:
            logger.exception("Планировщик серий: ошибка продления")
        await asyncio.sleep(interval_seconds)


def start_series_scheduler() -> None:
    """Запустить фоновое продление серий (если включено в настройках)."""
    global _series_task
    if not settings.WORK_SERIES_ENABLED or settings.WORK_SERIES_INTERVAL_MINUTES <= 0:
        logger.info("Планировщик серий: выключен")
        return
    if _series_task and not _series_task.done():
        return
    _series_task = asyncio.create_task(
        _series_loop(settings.WORK_SERIES_INTERVAL_MINUTES * 60)
    )
    logger.info(
        "Планировщик серий: запущен (интервал %s мин, горизонт %s нед.)",
        settings.WORK_SERIES_INTERVAL_MINUTES,
        settings.WORK_SERIES_HORIZON_WEEKS,
    )


async def stop_series_scheduler() -> None:
    global _series_task
    if _series_task:
        _series_task.cancel()
        try:
            await _series_task
        except asyncio.CancelledError:
            pass
        _series_task = None
