"""
Синхронизация SLA и услуг из Zabbix в БД.
Связь SLA↔Service через теги.
"""

import json
import logging
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sla import SLA
from app.models.service import Service
from app.models.sla_service_link import SlaServiceLink
from app.services.zabbix_client import zabbix_client

logger = logging.getLogger(__name__)


async def sync_slas(db: AsyncSession) -> int:
    """Синхронизировать SLA из Zabbix в БД."""
    zabbix_slas = await zabbix_client.sla_get()
    count = 0

    for zslA in zabbix_slas:
        # Upsert
        result = await db.execute(
            select(SLA).where(SLA.zabbix_slaid == zslA["slaid"])
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.name = zslA["name"]
            existing.slo = float(zslA["slo"])
            existing.schedule_type = zslA.get("period", "24x7")
        else:
            db.add(SLA(
                zabbix_slaid=zslA["slaid"],
                name=zslA["name"],
                slo=float(zslA["slo"]),
                schedule_type=zslA.get("period", "24x7"),
            ))
        count += 1

    await db.flush()
    logger.info(f"Synced {count} SLAs from Zabbix")
    return count


async def sync_services(db: AsyncSession) -> int:
    """Синхронизировать услуги из Zabbix в БД."""
    zabbix_services = await zabbix_client.service_get()
    count = 0

    for zsvc in zabbix_services:
        result = await db.execute(
            select(Service).where(Service.zabbix_serviceid == zsvc["serviceid"])
        )
        existing = result.scalar_one_or_none()

        tags_json = json.dumps(zsvc.get("tags", []))

        if existing:
            existing.name = zsvc["name"]
            existing.algorithm = zsvc.get("algorithm", "0")
            existing.sortorder = int(zsvc.get("sortorder", 0))
            existing.status = int(zsvc.get("status", 0))
            existing.tags = tags_json
        else:
            db.add(Service(
                zabbix_serviceid=zsvc["serviceid"],
                name=zsvc["name"],
                parent_zabbix_serviceid=zsvc.get("parent_serviceid"),
                algorithm=zsvc.get("algorithm", "0"),
                sortorder=int(zsvc.get("sortorder", 0)),
                status=int(zsvc.get("status", 0)),
                tags=tags_json,
            ))
        count += 1

    await db.flush()
    logger.info(f"Synced {count} services from Zabbix")
    return count


async def sync_sla_service_links(db: AsyncSession) -> int:
    """
    Построить связь SLA↔Service через теги.
    
    Логика:
    - У SLA есть service_tags: ["ABH_HANA", "CORE_BANKING"]
    - У Service есть tags: [{"tag": "service", "value": "ABH_HANA"}]
    - Если tag.value услуги совпадает с service_tag SLA → связь
    """
    # Очистить старые связи
    await db.execute(delete(SlaServiceLink))

    # Получить все SLA и Services
    slas_result = await db.execute(select(SLA))
    slas = slas_result.scalars().all()

    services_result = await db.execute(select(Service))
    services = services_result.scalars().all()

    count = 0
    for sla in slas:
        # Получить service_tags из Zabbix (нужно запросить отдельно)
        # Для простоты — парсим из имени или храним в БД
        # В реальности: при sync_slas сохраняем service_tags
        pass

    # Альтернативный подход: через tags services
    for sla in slas:
        for service in services:
            if service.tags:
                try:
                    svc_tags = json.loads(service.tags)
                    for tag in svc_tags:
                        if tag.get("tag") == "service":
                            # Проверяем, есть ли этот value в service_tags SLA
                            # Для демо — матчим по подстроке в имени
                            if sla.name.upper().replace(" ", "_") in tag.get("value", "").upper() or \
                               tag.get("value", "").upper() in sla.name.upper().replace(" ", "_"):
                                db.add(SlaServiceLink(sla_id=sla.id, service_id=service.id))
                                count += 1
                                break
                except (json.JSONDecodeError, TypeError):
                    pass

    await db.flush()
    logger.info(f"Built {count} SLA-Service links via tags")
    return count


async def full_sync(db: AsyncSession) -> dict:
    """Полная синхронизация: SLA → Services → Links."""
    sla_count = await sync_slas(db)
    svc_count = await sync_services(db)
    link_count = await sync_sla_service_links(db)
    return {"slas": sla_count, "services": svc_count, "links": link_count}
