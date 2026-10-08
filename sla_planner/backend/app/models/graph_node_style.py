"""Цвета узлов графа моделей здоровья (общие для всех пользователей).

Два типа узлов, которым можно менять цвет в интерфейсе графа:
- "sla"     — узлы SLA (ряд над деревом);
- "service" — узлы услуг (корень дерева чуть темнее, дети — базовый цвет).

Цвета общие (не привязаны к конкретной модели здоровья): одна пара цветов
применяется ко всем моделям. Настройку меняет admin, видят все.
"""

from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class GraphNodeStyle(Base):
    __tablename__ = "graph_node_styles"
    __table_args__ = (
        UniqueConstraint("node_type", name="uq_graph_style_type"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    node_type = Column(String(50), nullable=False)  # "sla" | "service"
    color = Column(String(9), nullable=False)       # "#RRGGBB"
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())