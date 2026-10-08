"""Позиции узлов графа (раскладка моделей здоровья), общая для всех пользователей.

Node keys: "svc:<zabbix_serviceid>" для услуг и "sla:<zabbix_slaid>" для SLA —
позиции переживают смену внутренних id БД после синхронизации/prune.
"""

from sqlalchemy import Column, Float, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class GraphNodePosition(Base):
    __tablename__ = "graph_node_positions"
    __table_args__ = (
        UniqueConstraint("model_key", "node_key", name="uq_graph_pos_model_node"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_key = Column(String(255), nullable=False, index=True)  # root zabbix_serviceid
    node_key = Column(String(255), nullable=False)  # "svc:..." | "sla:..."
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())