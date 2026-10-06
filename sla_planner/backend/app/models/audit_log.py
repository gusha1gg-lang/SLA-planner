from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(50), nullable=False)  # create, update, delete, sync, login
    entity_type = Column(String(50), nullable=False)  # planned_work, sla, service, user
    entity_id = Column(Integer, nullable=True)
    payload = Column(Text, nullable=True)  # JSON без токенов
    result = Column(String(10), default="ok")  # ok | error
    created_at = Column(DateTime(timezone=True), server_default=func.now())
