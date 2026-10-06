from sqlalchemy import Column, Integer, ForeignKey
from app.database import Base


class SlaServiceLink(Base):
    """Связь SLA ↔ Service через теги."""
    __tablename__ = "sla_service_links"

    sla_id = Column(Integer, ForeignKey("slas.id"), primary_key=True)
    service_id = Column(Integer, ForeignKey("services.id"), primary_key=True)
