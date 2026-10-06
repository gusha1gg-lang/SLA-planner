from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func

from app.database import Base


class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, autoincrement=True)
    zabbix_serviceid = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    parent_zabbix_serviceid = Column(String(50), nullable=True)
    algorithm = Column(String(10), default="0")  # 0=status, 1=worst
    sortorder = Column(Integer, default=0)
    status = Column(Integer, default=0)
    tags = Column(Text, nullable=True)  # JSON: [{"tag":"service","value":"X"}]
    synced_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
