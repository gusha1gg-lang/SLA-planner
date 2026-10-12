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

Производительность (2026-10-12):
- Upsert SLA/услуг — одним `INSERT ... ON CONFLICT DO UPDATE` порциями
  (вместо SELECT + INSERT/UPDATE по каждому объекту — было N+1 запросов).
- Связи SLA↔Service — через обратный индекс по значениям тега `service`
  (O(суммарное число тегов), а не O(число SLA × число услуг)).
- Prune — сравнение ключей в Python + порционные DELETE
  (без гигантского NOT IN с тысячами параметров).
"""

import json
import logging

from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sla import SLA
from app.models.service import Service
from app.models.sla_service_link import SlaServiceLink
from app.models.planned_work import PlannedWork
from app.services.zabbix_client import zabbix_client

logger = logging.getLogger(__name__)

# Размер порции для bulk INSERT/DELETE — не упираемся в лимит параметров
# диалекта (SQLite ~32k, PostgreSQL 65535 параметров).
_BULK_CHUNK = 500


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


def _service_tag_values(tags_json: str | None) -> set[str]:
    """Значения тега `service` у услуги (JSON из БД) в нижнем регистре."""
    if not tags_json:
        return set()
    try:
        tags = json.loads(tags_json)
    except (json.JSONDecodeError, TypeError):
        return set()
    return {
        str(t.get("value", "")).strip().lower()
        for t in tags
        if isinstance(t, dict)
        and str(t.get("tag", "")).strip().lower() == "service"
        and t.get("value")
    }


def _chunks(items: list, size: int = _BULK_CHUNK):
    """Разбить список на порции заданного размера."""
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _upsert_stmt(bind, model, rows, conflict_cols, update_cols):
    """
    INSERT ... ON CONFLICT DO UPDATE для текущего диалекта (PostgreSQL/SQLite).

    update_cols — колонки, обновляемые из `excluded` при конфликте;
    `synced_at` дополнительно перебивается на now() (ORM-onupdate при
    bulk-вставке не срабатывает).
    """
    if bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as dialect_insert
    else:
        from sqlalchemy.dialects.sqlite import insert as dialect_insert

    stmt = dialect_insert(model).values(rows)
    set_ = {col: getattr(stmt.excluded, col) for col in update_cols}
    set_["synced_at"] = func.now()
    return stmt.on_conflict_do_update(index_elements=conflict_cols, set_=set_)


async def _delete_by_ids(db: AsyncSession, model, column, ids):
    """Порционное удаление строк по списку id (модель и колонка-фильтр)."""
    for chunk in _chunks(list(ids)):
        await db.execute(delete(model).where(column.in_(chunk)))


async def sync_slas(db: AsyncSession) -> int:
    """Синхронизировать SLA из Zabbix в БД (bulk-upsert) + prune пропавших."""
    zabbix_slas = await zabbix_client.sla_get()

    rows = []
    for zsla in zabbix_slas:
        service_tags = zsla.get("service_tags", [])
        rows.append({
            "zabbix_slaid": str(zsla["slaid"]),
            "name": zsla["name"],
            "slo": float(zsla["slo"]),
            "schedule_type": zsla.get("period", "24x7"),
            "service_tags": json.dumps(service_tags) if service_tags else None,
        })

    if rows:
        bind = db.get_bind()
        for chunk in _chunks(rows):
            await db.execute(_upsert_stmt(
                bind, SLA, chunk,
                conflict_cols=["zabbix_slaid"],
                update_cols=["name", "slo", "schedule_type", "service_tags"],
            ))

    # ── Prune: удалить SLA, которых больше нет в Zabbix ──
    if zabbix_slas:
        keep = {str(z["slaid"]) for z in zabbix_slas}
        existing = (await db.execute(select(SLA.id, SLA.zabbix_slaid, SLA.name))).all()
        stale = [(row.id, row.name) for row in existing if row.zabbix_slaid not in keep]
        if stale:
            stale_ids = [rid for rid, _ in stale]
            await _delete_by_ids(db, PlannedWork, PlannedWork.sla_id, stale_ids)
            await _delete_by_ids(db, SlaServiceLink, SlaServiceLink.sla_id, stale_ids)
            await _delete_by_ids(db, SLA, SLA.id, stale_ids)
            logger.info(
                "Pruned %d SLAs missing in Zabbix: %s",
                len(stale), [name for _, name in stale],
            )
    else:
        logger.warning("Zabbix returned 0 SLAs — prune skipped (safety)")

    logger.info("Synced %d SLAs from Zabbix (bulk upsert)", len(rows))
    return len(rows)


async def sync_services(db: AsyncSession) -> int:
    """Синхронизировать услуги из Zabbix в БД (bulk-upsert) + prune пропавших."""
    zabbix_services = await zabbix_client.service_get()

    rows = []
    for zsvc in zabbix_services:
        # Zabbix 7.0: иерархия через parents[], а не parent_serviceid.
        parents = zsvc.get("parents", []) or []
        rows.append({
            "zabbix_serviceid": str(zsvc["serviceid"]),
            "name": zsvc["name"],
            "parent_zabbix_serviceid": str(parents[0]["serviceid"]) if parents else None,
            "algorithm": zsvc.get("algorithm", "0"),
            "sortorder": int(zsvc.get("sortorder", 0)),
            "status": int(zsvc.get("status", 0)),
            "tags": json.dumps(zsvc.get("tags", [])),
        })

    if rows:
        bind = db.get_bind()
        for chunk in _chunks(rows):
            await db.execute(_upsert_stmt(
                bind, Service, chunk,
                conflict_cols=["zabbix_serviceid"],
                update_cols=[
                    "name", "parent_zabbix_serviceid", "algorithm",
                    "sortorder", "status", "tags",
                ],
            ))

    # ── Prune: удалить услуги, которых больше нет в Zabbix ──
    if zabbix_services:
        keep = {str(z["serviceid"]) for z in zabbix_services}
        existing = (
            await db.execute(select(Service.id, Service.zabbix_serviceid, Service.name))
        ).all()
        stale = [(row.id, row.name) for row in existing if row.zabbix_serviceid not in keep]
        if stale:
            stale_ids = [rid for rid, _ in stale]
            await _delete_by_ids(db, PlannedWork, PlannedWork.service_id, stale_ids)
            await _delete_by_ids(db, SlaServiceLink, SlaServiceLink.service_id, stale_ids)
            await _delete_by_ids(db, Service, Service.id, stale_ids)
            logger.info(
                "Pruned %d services missing in Zabbix: %s",
                len(stale), [name for _, name in stale],
            )
    else:
        logger.warning("Zabbix returned 0 services — prune skipped (safety)")

    logger.info("Synced %d services from Zabbix (bulk upsert)", len(rows))
    return len(rows)


async def sync_sla_service_links(db: AsyncSession) -> int:
    """
    Перестроить связи SLA↔Service по тегам.

    Матчинг точный (без учёта регистра):
    - у SLA: значения service_tags (тег `service`);
    - у услуги: значение тега `service`;
    - если совпали → связь.

    Строим обратный индекс «значение тега → id услуг» — O(суммарно тегов),
    вместо вложенных циклов по всем SLA × всем услугам.
    """
    # Очистить старые связи — перестраиваем с нуля
    await db.execute(delete(SlaServiceLink))

    slas = (await db.execute(select(SLA))).scalars().all()
    services = (await db.execute(select(Service.id, Service.tags))).all()

    # Обратный индекс: значение тега `service` (lower) → id услуг.
    by_tag: dict[str, list[int]] = {}
    for sid, tags in services:
        for value in _service_tag_values(tags):
            by_tag.setdefault(value, []).append(sid)

    rows: list[dict] = []
    for sla in slas:
        sla_tags = sla_tag_values(sla)
        if not sla_tags:
            continue
        matched: set[int] = set()
        for value in sla_tags:
            matched.update(by_tag.get(value, ()))
        rows.extend({"sla_id": sla.id, "service_id": sid} for sid in matched)

    for chunk in _chunks(rows):
        await db.execute(insert(SlaServiceLink).values(chunk))

    logger.info("Built %d SLA-Service links via tags", len(rows))
    return len(rows)


async def full_sync(db: AsyncSession) -> dict:
    """Полная синхронизация: SLA → Services → Links (только живые данные)."""
    sla_count = await sync_slas(db)
    svc_count = await sync_services(db)
    link_count = await sync_sla_service_links(db)
    return {"slas": sla_count, "services": svc_count, "links": link_count}