"""Graph layout router — сохранение раскладки (позиций узлов) по моделям здоровья.

GET    /api/graph/positions?model=<rootId>  → список позиций (все роли)
PUT    /api/graph/positions                  → перезаписать раскладку (admin)
DELETE /api/graph/positions?model=<rootId>   → сбросить раскладку (admin)

GET    /api/graph/colors                     → цвета узлов SLA и услуг (все роли)
PUT    /api/graph/colors                     → изменить цвета (admin)

Раскладка и цвета общие: закрепляет admin, видят все.
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
from app.routers.auth import get_current_user

router = APIRouter()


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
    current_user: User = Depends(get_current_user),
):
    """Раскладка модели здоровья. Общая для всех пользователей."""
    result = await db.execute(
        select(GraphNodePosition).where(GraphNodePosition.model_key == model)
    )
    rows = result.scalars().all()
    return [{"node_key": r.node_key, "x": r.x, "y": r.y} for r in rows]


@router.put("/positions")
async def save_positions(
    data: SavePositionsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Перезаписать раскладку модели целиком (только admin)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can pin graph layout")

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
    current_user: User = Depends(get_current_user),
):
    """Сбросить раскладку модели (только admin)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can reset graph layout")

    await db.execute(
        delete(GraphNodePosition).where(GraphNodePosition.model_key == model)
    )
    return {"cleared": True}


@router.get("/colors")
async def get_graph_colors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
):
    """Изменить цвета узлов SLA и услуг (только admin)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can change graph colors")

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