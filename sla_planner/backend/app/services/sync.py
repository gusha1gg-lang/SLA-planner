"""
Синхронизация SLA и услуг из Zabbix в БД.
Связь SLA↔Service через теги.

Правила:
- Работаем ТОЛЬКО с живыми данными из Zabbix: всё, чего больше нет в Zabbix,
  удаляется из БД (prune), включая зависшие плановые работы и связи.
- Связь SLA↔Service: точное совпадение (без учёта регистра) значения тега
  `service` у услуги со значениями service_tags у SLA.
- Защита: если Zabbix вернул пустой список — prune пропускается,
  чтобы не стереть БД из-за ошибки API/прав доступа.
"""

import json
import logging
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sla import SLA
from app.models.service import Service
from app.models.sla_service_link import SlaServiceLink
from app.models.planned_work import PlannedWork
from app.services.zabbix_client import zabbix_client

logger = logging.getLogger(__name__)


def sla_service_tags(sla: SLA) -> list[str]:
    """
    Значения service_tags SLA в оригинальном регистре (порядок сохраняется).

    Используется в API (/api/sla/) — фронт получает string[] и матчит
    услуги по тегу `service`. Конвенция Zabbix: тег называется `service`;
    если его нет — возвращаем все значения как фолбэк.
    """
    if not sla.service_tags:
        return []
    try:
        tags = json.loads(sla.service_tags)
    except (json.JSONDecodeError, TypeError):
        return []

    all_values: list[str] = []
    service_values: list[str] = []
    for t in tags:
        if not isinstance(t, dict):
            continue
        value = str(t.get("value", "")).strip()
        if not value:
            continue
        all_values.append(value)
        if str(t.get("tag", "")).strip().lower() == "service":
            service_values.append(value)

    return list(dict.fromkeys(service_values or all_values))


def sla_tag_values(sla: SLA) -> set[str]:
    """Значения service_tags SLA в нижнем регистре (для case-insensitive матчинга связей)."""
    return {v.lower() for v in sla_service_tags(sla)}


def _service_tag_values(service: Service) -> set[str]:
    """Значения тега `service` у услуги в нижнем регистре."""
    if not service.tags:
        return set()
    try:
        tags = json.loads(service.tags)
    except (json.JSONDecodeError, TypeError):
        return set()
    return {
        str(t.get("value", "")).strip().lower()
        for t in tags
        if isinstance(t, dict)
        and str(t.get("tag", "")).strip().lower() == "service"
        and t.get("value")
    }


async def sync_slas(db: AsyncSession) -> int:
    """Синхронизировать SLA из Zabbix в БД + prune пропавших."""
    zabbix_slas = await zabbix_client.sla_get()
    count = 0

    for zslA in zabbix_slas:
        # Upsert
        result = await db.execute(
            select(SLA).where(SLA.zabbix_slaid == str(zslA["slaid"]))
        )
        existing = result.scalar_one_or_none()

        # Сохраняем service_tags как JSON
        service_tags = zslA.get("service_tags", [])
        service_tags_json = json.dumps(service_tags) if service_tags else None

        if existing:
            existing.name = zslA["name"]
            existing.slo = float(zslA["slo"])
            existing.schedule_type = zslA.get("period", "24x7")
            existing.service_tags = service_tags_json
        else:
            db.add(SLA(
                zabbix_slaid=str(zslA["slaid"]),
                name=zslA["name"],
                slo=float(zslA["slo"]),
                schedule_type=zslA.get("period", "24x7"),
                service_tags=service_tags_json,
            ))
        count += 1

    # ── Prune: удалить SLA, которых больше нет в Zabbix ──
    if zabbix_slas:
        keep = {str(z["slaid"]) for z in zabbix_slas}
        stale = (await db.execute(
            select(SLA).where(SLA.zabbix_slaid.notin_(keep))
        )).scalars().all()
        if stale:
            stale_ids = [s.id for s in stale]
            await db.execute(delete(PlannedWork).where(PlannedWork.sla_id.in_(stale_ids)))
            await db.execute(delete(SlaServiceLink).where(SlaServiceLink.sla_id.in_(stale_ids)))
            await db.execute(delete(SLA).where(SLA.id.in_(stale_ids)))
            logger.info(
                "Pruned %d SLAs missing in Zabbix: %s",
                len(stale), [s.name for s in stale],
            )
    else:
        logger.warning("Zabbix returned 0 SLAs — prune skipped (safety)")

    await db.flush()
    logger.info(f"Synced {count} SLAs from Zabbix")
    return count


async def sync_services(db: AsyncSession) -> int:
    """Синхронизировать услуги из Zabbix в БД + prune пропавших."""
    zabbix_services = await zabbix_client.service_get()
    count = 0

    for zsvc in zabbix_services:
        result = await db.execute(
            select(Service).where(Service.zabbix_serviceid == str(zsvc["serviceid"]))
        )
        existing = result.scalar_one_or_none()

        tags_json = json.dumps(zsvc.get("tags", []))

        if existing:
            existing.name = zsvc["name"]
            existing.algorithm = zsvc.get("algorithm", "0")
            existing.sortorder = int(zsvc.get("sortorder", 0))
            existing.status = int(zsvc.get("status", 0))
            existing.tags = tags_json
            existing.parent_zabbix_serviceid = zsvc.get("parent_serviceid")
        else:
            db.add(Service(
                zabbix_serviceid=str(zsvc["serviceid"]),
                name=zsvc["name"],
                parent_zabbix_serviceid=zsvc.get("parent_serviceid"),
                algorithm=zsvc.get("algorithm", "0"),
                sortorder=int(zsvc.get("sortorder", 0)),
                status=int(zsvc.get("status", 0)),
                tags=tags_json,
            ))
        count += 1

    # ── Prune: удалить услуги, которых больше нет в Zabbix ──
    if zabbix_services:
        keep = {str(z["serviceid"]) for z in zabbix_services}
        stale = (await db.execute(
            select(Service).where(Service.zabbix_serviceid.notin_(keep))
        )).scalars().all()
        if stale:
            stale_ids = [s.id for s in stale]
            await db.execute(delete(PlannedWork).where(PlannedWork.service_id.in_(stale_ids)))
            await db.execute(delete(SlaServiceLink).where(SlaServiceLink.service_id.in_(stale_ids)))
            await db.execute(delete(Service).where(Service.id.in_(stale_ids)))
            logger.info(
                "Pruned %d services missing in Zabbix: %s",
                len(stale), [s.name for s in stale],
            )
    else:
        logger.warning("Zabbix returned 0 services — prune skipped (safety)")

    await db.flush()
    logger.info(f"Synced {count} services from Zabbix")
    return count


async def sync_sla_service_links(db: AsyncSession) -> int:
    """
    Перестроить связи SLA↔Service по тегам.

    Матчинг точный (без учёта регистра):
    - у SLA: значения service_tags (тег `service`);
    - у услуги: значение тега `service`;
    - если совпали → связь.
    """
    # Очистить старые связи — перестраиваем с нуля
    await db.execute(delete(SlaServiceLink))

    slas = (await db.execute(select(SLA))).scalars().all()
    services = (await db.execute(select(Service))).scalars().all()

    # Заранее собираем теги услуг
    service_tags = {s.id: _service_tag_values(s) for s in services}

    count = 0
    for sla in slas:
        sla_tags = sla_tag_values(sla)
        if not sla_tags:
            continue
        for service in services:
            svc_tags = service_tags[service.id]
            if svc_tags and svc_tags & sla_tags:
                db.add(SlaServiceLink(sla_id=sla.id, service_id=service.id))
                count += 1

    await db.flush()
    logger.info(f"Built {count} SLA-Service links via tags")
    return count


async def full_sync(db: AsyncSession) -> dict:
    """Полная синхронизация: SLA → Services → Links (только живые данные)."""
    sla_count = await sync_slas(db)
    svc_count = await sync_services(db)
    link_count = await sync_sla_service_links(db)
    return {"slas": sla_count, "services": svc_count, "links": link_count}
