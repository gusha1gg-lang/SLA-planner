"""Отправка окна плановой работы в Zabbix (excluded downtime).

Общая логика для одиночных работ и вхождений цикличных серий
(`app/services/recurrence.py`). Читает текущие `excluded_downtimes` SLA,
убирает устаревшие записи и добавляет актуальную (read-modify-write).
"""

from datetime import timedelta, timezone

from app.models.planned_work import PlannedWork
from app.models.sla import SLA
from app.services.zabbix_client import zabbix_client

# Москва — UTC+3 круглый год, без перехода на летнее время.
MSK = timezone(timedelta(hours=3))


def work_downtime_name(work: PlannedWork) -> str:
    """Имя окна в Zabbix.

    Обычная работа — просто заголовок. Вхождение серии — заголовок + дата (МСК),
    иначе окна разных недель затирали бы друг друга при дедупе по имени.
    """
    if work.series_id and work.started_at is not None:
        start = work.started_at
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        return f"{work.title} ({start.astimezone(MSK).strftime('%Y-%m-%d')})"
    return work.title


async def reconcile_zabbix_window(
    work: PlannedWork,
    sla: SLA,
    *,
    name: str | None = None,
    stale_names: list[str] | None = None,
) -> None:
    """Идемпотентно синхронизировать окно работы в Zabbix.

    Удаляет устаревшие записи (маркер `SLA Planner #<id>` + переданные имена,
    например старый заголовок после переименования) и добавляет актуальное окно.
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
        name=name or work_downtime_name(work),
        period_from=work.downtime_period_from,
        period_to=work.downtime_period_to,
    )


async def remove_zabbix_window(work: PlannedWork, sla: SLA) -> None:
    """Убрать окно работы из Zabbix (по маркеру и по имени)."""
    await zabbix_client.remove_excluded_downtime(
        slaid=sla.zabbix_slaid,
        downtime_name=work.downtime_marker,
    )
    await zabbix_client.remove_excluded_downtime(
        slaid=sla.zabbix_slaid,
        downtime_name=work_downtime_name(work),
    )
