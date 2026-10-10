"""Graph layout router — сохранение раскладки (позиций узлов) по моделям здоровья.

GET    /api/graph/positions?model=<rootId>  → список позиций (право model)
PUT    /api/graph/positions                  → перезаписать раскладку (graph.edit)
DELETE /api/graph/positions?model=<rootId>   → сбросить раскладку (graph.edit)

GET    /api/graph/colors                     → цвета узлов SLA и услуг (право model)
PUT    /api/graph/colors                     → изменить цвета (graph.edit)

Раскладка и цвета общие: закрепляет пользователь с правом graph.edit, видят все.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.graph_node_position import GraphNodePosition
from app.models.graph_node_style import GraphNodeStyle
from app.models.user import User
from app.permissions import (
    P_GRAPH_EDIT,
    P_MODEL,
    can_access_model,
    can_edit_model,
    require_permission,
)

router = APIRouter()


def _forbidden_model() -> HTTPException:
    return HTTPException(status_code=403, detail="Нет доступа к этой модели здоровья")


class NodePosition(BaseModel):
    node_key: str
    x: float
    y: float


class SavePositionsRequest(BaseModel):
    model: str
    positions: List[NodePosition]


HEX_COLOR_RE = r"^#[0-9a-fA-F]{6}$"


class NodeColors(BaseModel):
    sla: str
    service: str

    @field_validator("sla", "service")
    @classmethod
    def valid_hex(cls, v: str) -> str:
        import re

        if not re.match(HEX_COLOR_RE, v.strip()):
            raise ValueError("color must be #RRGGBB")
        return v.strip()


DEFAULT_COLORS = {"sla": "#3B82F6", "service": "#8B5CF6"}


@router.get("/positions")
async def get_positions(
    model: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_MODEL)),
):
    """Раскладка модели здоровья. Общая для всех пользователей с доступом к модели."""
    if not await can_access_model(current_user, db, model):
        raise _forbidden_model()
    result = await db.execute(
        select(GraphNodePosition).where(GraphNodePosition.model_key == model)
    )
    rows = result.scalars().all()
    return [{"node_key": r.node_key, "x": r.x, "y": r.y} for r in rows]


@router.put("/positions")
async def save_positions(
    data: SavePositionsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_GRAPH_EDIT)),
):
    """Перезаписать раскладку модели целиком (право graph.edit)."""
    if not await can_edit_model(current_user, db, data.model):
        raise _forbidden_model()
    await db.execute(
        delete(GraphNodePosition).where(GraphNodePosition.model_key == data.model)
    )
    for pos in data.positions:
        db.add(GraphNodePosition(
            model_key=data.model,
            node_key=pos.node_key,
            x=pos.x,
            y=pos.y,
        ))
    return {"saved": len(data.positions)}


@router.delete("/positions")
async def clear_positions(
    model: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_GRAPH_EDIT)),
):
    """Сбросить раскладку модели (право graph.edit)."""
    if not await can_edit_model(current_user, db, model):
        raise _forbidden_model()
    await db.execute(
        delete(GraphNodePosition).where(GraphNodePosition.model_key == model)
    )
    return {"cleared": True}


@router.get("/colors")
async def get_graph_colors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_MODEL)),
):
    """Цвета узлов SLA и услуг. Общие для всех моделей и пользователей."""
    result = await db.execute(select(GraphNodeStyle))
    rows = {r.node_type: r.color for r in result.scalars().all()}
    return {
        "sla": rows.get("sla", DEFAULT_COLORS["sla"]),
        "service": rows.get("service", DEFAULT_COLORS["service"]),
    }


@router.put("/colors")
async def save_graph_colors(
    data: NodeColors,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_GRAPH_EDIT)),
):
    """Изменить цвета узлов SLA и услуг (право graph.edit)."""
    for node_type, color in (("sla", data.sla), ("service", data.service)):
        result = await db.execute(
            select(GraphNodeStyle).where(GraphNodeStyle.node_type == node_type)
        )
        row = result.scalar_one_or_none()
        if row is None:
            db.add(GraphNodeStyle(node_type=node_type, color=color))
        else:
            row.color = color
    return {"saved": True}