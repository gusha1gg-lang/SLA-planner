from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.database import Base


class PlannedWork(Base):
    __tablename__ = "planned_works"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=False)
    sla_id = Column(Integer, ForeignKey("slas.id"), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(20), default="draft")  # draft→planned→active→done→cancelled→sync_error
    downtime_marker = Column(String(100), nullable=True)  # "SLA Planner #<id>"
    downtime_period_from = Column(String(20), nullable=True)  # unixtime строкой
    downtime_period_to = Column(String(20), nullable=True)    # unixtime строкой
    sync_error = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
