"""Graph layout router — сохранение раскладки (позиций узлов) по моделям здоровья.

GET    /api/graph/positions?model=<rootId>  → список позиций (право model)
PUT    /api/graph/positions                  → перезаписать раскладку (graph.edit)
DELETE /api/graph/positions?model=<rootId>   → сбросить раскладку (graph.edit)

GET    /api/graph/colors[?model=<rootId>]    → базовые цвета типов (+ индивидуальные
                                               цвета узлов модели) (право model)
PUT    /api/graph/colors                     → базовые цвета типов SLA/услуг (graph.edit)
PUT    /api/graph/colors/node                → цвет конкретного узла модели (graph.edit)
DELETE /api/graph/colors/node?model=&node_key= → сбросить цвет узла к базовому (graph.edit)

Раскладка и базовые цвета общие; индивидуальные цвета узлов — свои у каждой модели:
закрепляет пользователь с правом graph.edit, видят все с доступом к модели.
"""

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.graph_node_color import GraphNodeColor
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


def _validate_hex(v: str) -> str:
    import re

    if not re.match(HEX_COLOR_RE, v.strip()):
        raise ValueError("color must be #RRGGBB")
    return v.strip()


class NodeColors(BaseModel):
    sla: str
    service: str

    @field_validator("sla", "service")
    @classmethod
    def valid_hex(cls, v: str) -> str:
        return _validate_hex(v)


class NodeColorRequest(BaseModel):
    """Цвет конкретного узла модели: node_key = "svc:..." | "sla:..."."""

    model: str
    node_key: str
    color: str

    @field_validator("color")
    @classmethod
    def valid_hex(cls, v: str) -> str:
        return _validate_hex(v)


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
    model: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_MODEL)),
):
    """Цвета узлов.

    Всегда отдаёт базовые цвета типов (SLA/услуга, общие для всех моделей);
    если передан `model` — добавляет индивидуальные цвета узлов этой модели
    (dict node_key → color), к которым у пользователя есть доступ.
    """
    result = await db.execute(select(GraphNodeStyle))
    rows = {r.node_type: r.color for r in result.scalars().all()}

    node_colors: Dict[str, str] = {}
    if model:
        if not await can_access_model(current_user, db, model):
            raise _forbidden_model()
        node_result = await db.execute(
            select(GraphNodeColor).where(GraphNodeColor.model_key == model)
        )
        node_colors = {r.node_key: r.color for r in node_result.scalars().all()}

    return {
        "sla": rows.get("sla", DEFAULT_COLORS["sla"]),
        "service": rows.get("service", DEFAULT_COLORS["service"]),
        "nodes": node_colors,
    }


@router.put("/colors")
async def save_graph_colors(
    data: NodeColors,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_GRAPH_EDIT)),
):
    """Изменить базовые цвета типов SLA/услуг (право graph.edit)."""
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


@router.put("/colors/node")
async def save_graph_node_color(
    data: NodeColorRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_GRAPH_EDIT)),
):
    """Задать цвет конкретного узла модели (право graph.edit на модель)."""
    if not await can_edit_model(current_user, db, data.model):
        raise _forbidden_model()
    result = await db.execute(
        select(GraphNodeColor).where(
            GraphNodeColor.model_key == data.model,
            GraphNodeColor.node_key == data.node_key,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        db.add(GraphNodeColor(
            model_key=data.model,
            node_key=data.node_key,
            color=data.color,
        ))
    else:
        row.color = data.color
    return {"saved": True}


@router.delete("/colors/node")
async def clear_graph_node_color(
    model: str,
    node_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(P_GRAPH_EDIT)),
):
    """Сбросить цвет узла к базовому (право graph.edit на модель)."""
    if not await can_edit_model(current_user, db, model):
        raise _forbidden_model()
    await db.execute(
        delete(GraphNodeColor).where(
            GraphNodeColor.model_key == model,
            GraphNodeColor.node_key == node_key,
        )
    )
    return {"cleared": True}