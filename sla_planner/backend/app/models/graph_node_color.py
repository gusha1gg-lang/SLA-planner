"""Индивидуальные цвета узлов графа моделей здоровья.

Цвет можно задать КАЖДОМУ узлу (конкретной услуге или конкретному SLA) внутри
модели здоровья — и он свой у каждой модели (практики): та же услуга в разных
моделях может быть разного цвета.

Node keys совпадают с раскладкой (см. graph_node_position): "svc:<zabbix_serviceid>"
для услуг и "sla:<zabbix_slaid>" для SLA — цвета переживают смену внутренних id БД.

Базовые цвета типов ("sla"/"service", общие для всех моделей) остаются в
graph_node_styles и используются как значения по умолчанию.
"""

from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class GraphNodeColor(Base):
    __tablename__ = "graph_node_colors"
    __table_args__ = (
        UniqueConstraint("model_key", "node_key", name="uq_graph_node_color"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_key = Column(String(255), nullable=False, index=True)  # root zabbix_serviceid
    node_key = Column(String(255), nullable=False)  # "svc:..." | "sla:..."
    color = Column(String(9), nullable=False)       # "#RRGGBB"
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
