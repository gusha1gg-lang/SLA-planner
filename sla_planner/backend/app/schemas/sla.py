"""Pydantic schemas for SLA."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class SLABase(BaseModel):
    zabbix_slaid: str
    name: str
    slo: float
    schedule_type: str = "24x7"
    schedule_json: Optional[str] = None


class SLAResponse(SLABase):
    id: int
    synced_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SLASyncResponse(BaseModel):
    synced: int
