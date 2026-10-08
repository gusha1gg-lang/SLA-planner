"""Graph layout router — сохранение раскладки (позиций узлов) по моделям здоровья.

GET    /api/graph/positions?model=<rootId>  → список позиций (все роли)
PUT    /api/graph/positions                  → перезаписать раскладку (admin)
DELETE /api/graph/positions?model=<rootId>   → сбросить раскладку (admin)

Раскладка общая: закрепляет admin, видят все.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.graph_node_position import GraphNodePosition
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