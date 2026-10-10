"""Services router — list, sync from Zabbix."""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.service import Service
from app.models.user import User
from app.routers.auth import get_current_user
from app.permissions import P_MODEL, P_SYNC, allowed_service_ids, require_permission
from app.services.sync import sync_services, sync_sla_service_links
from app.services.zabbix_client import zabbix_client, ZabbixError

router = APIRouter()

# Ярлыки Zabbix 7.0 (Значения документации Service object):
# algorithm: 0 — set status to OK; 1 — most critical if all children have problems;
#            2 — most critical of child services.
ALGORITHM_LABELS = {
    "0": "Установить статус «ОК»",
    "1": "Самое критичное, если все дочерние услуги в проблеме",
    "2": "Самое критичное из дочерних услуг",
}
# status: -1 — OK; 0..5 — критичность самой серьёзной проблемы.
STATUS_LABELS = {
    "-1": "OK",
    "0": "Не классифицировано",
    "1": "Информация",
    "2": "Предупреждение",
    "3": "Средняя",
    "4": "Высокая",
    "5": "Катастрофа",
}
# propagation_rule: 0 — as is; 1 — increase; 2 — decrease; 3 — ignore; 4 — fixed.
PROPAGATION_LABELS = {
    "0": "Как есть",
    "1": "Повышение критичности",
    "2": "Понижение критичности",
    "3": "Игнорировать",
    "4": "Фиксированный",
}
# Операторы тегов проблем (problem_tags): 0 — equals; 1 — not equal; 2 — contains; 3 — not contains.
PROBLEM_TAG_OPERATOR_LABELS = {
    "0": "Равно",
    "1": "Не равно",
    "2": "Содержит",
    "3": "Не содержит",
}


def _service_link(svc: dict) -> dict:
    """Родитель/ребёнок из selectParents/selectChildren: только полезные поля."""
    return {
        "serviceid": svc["serviceid"],
        "name": svc["name"],
        "status": int(svc.get("status", -1)),
    }


@router.get("/")
async def list_services(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список услуг из БД. Видны только услуги моделей здоровья, доступных
    пользователю по его группам (admin и группы «все модели» — все услуги)."""
    allowed = await allowed_service_ids(current_user, db)
    result = await db.execute(select(Service).order_by(Service.name))
    services = result.scalars().all()
    if allowed is not None:
        services = [s for s in services if s.zabbix_serviceid in allowed]
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_SYNC)),
):
    """Синхронизировать услуги из Zabbix (+ пересобрать связи). Право: sync.run."""
    count = await sync_services(db)
    links = await sync_sla_service_links(db)
    return {"synced": count, "links": links}


# ── Конфигурация услуги (живые данные из Zabbix, для просмотра ИТ-специалистами) ──

@router.get("/{zabbix_serviceid}/config")
async def service_config(
    zabbix_serviceid: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_MODEL)),
):
    """Живая конфигурация услуги из Zabbix: родители/дети, теги проблем,
    алгоритм вычисления состояния, правило распространения, вес и т.п.
    Право: model (видно на «Модели здоровья»); услуга должна быть в модели,
    доступной пользователю по его группам."""
    allowed = await allowed_service_ids(current_user, db)
    if allowed is not None and zabbix_serviceid not in allowed:
        raise HTTPException(status_code=403, detail="Нет доступа к услуге этой модели здоровья")
    try:
        s = await zabbix_client.service_config_get(zabbix_serviceid)
    except ZabbixError as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not s:
        raise HTTPException(status_code=404, detail="Услуга не найдена в Zabbix")

    algorithm = str(s.get("algorithm", "2"))
    status = str(s.get("status", "-1"))
    prop_rule = str(s.get("propagation_rule", "0"))

    created_at = None
    if s.get("created_at"):
        try:
            created_at = datetime.fromtimestamp(int(s["created_at"]), tz=timezone.utc).isoformat()
        except (ValueError, TypeError):
            created_at = None

    return {
        "serviceid": s["serviceid"],
        "name": s["name"],
        "description": s.get("description", "") or "",
        "algorithm": int(algorithm),
        "algorithm_label": ALGORITHM_LABELS.get(algorithm, algorithm),
        "status": int(status),
        "status_label": STATUS_LABELS.get(status, status),
        "sortorder": int(s.get("sortorder", 0)),
        "weight": int(s.get("weight", 0)),
        "propagation_rule": int(prop_rule),
        "propagation_rule_label": PROPAGATION_LABELS.get(prop_rule, prop_rule),
        "propagation_value": int(s.get("propagation_value", 0)),
        "created_at": created_at,
        "readonly": bool(s.get("readonly", False)),
        "tags": s.get("tags") or [],
        "problem_tags": [
            {
                "tag": pt.get("tag", ""),
                "operator": str(pt.get("operator", "0")),
                "operator_label": PROBLEM_TAG_OPERATOR_LABELS.get(
                    str(pt.get("operator", "0")), str(pt.get("operator", "0"))
                ),
                "value": pt.get("value", ""),
            }
            for pt in (s.get("problem_tags") or [])
        ],
        "parents": [_service_link(p) for p in (s.get("parents") or [])],
        "children": [_service_link(c) for c in (s.get("children") or [])],
    }
