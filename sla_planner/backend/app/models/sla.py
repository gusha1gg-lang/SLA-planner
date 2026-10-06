from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from sqlalchemy.sql import func

from app.database import Base


class SLA(Base):
    __tablename__ = "slas"

    id = Column(Integer, primary_key=True, autoincrement=True)
    zabbix_slaid = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    slo = Column(Float, nullable=False)
    schedule_type = Column(String(20), default="24x7")  # 24x7 | custom
    schedule_json = Column(Text, nullable=True)  # JSON для custom schedule
    synced_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
