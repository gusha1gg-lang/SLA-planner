"""Pydantic schemas for PlannedWork."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, validator


class PlannedWorkBase(BaseModel):
    title: str
    description: Optional[str] = None
    service_id: int
    sla_id: int
    started_at: datetime
    ended_at: datetime

    @validator("ended_at")
    def ended_after_started(cls, v, values):
        if "started_at" in values and v <= values["started_at"]:
            raise ValueError("ended_at must be after started_at")
        return v


class PlannedWorkCreate(PlannedWorkBase):
    pass


class PlannedWorkUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    service_id: Optional[int] = None
    sla_id: Optional[int] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    status: Optional[str] = None


class PlannedWorkResponse(PlannedWorkBase):
    id: int
    status: str
    downtime_marker: Optional[str] = None
    downtime_period_from: Optional[str] = None
    downtime_period_to: Optional[str] = None
    sync_error: Optional[str] = None
    created_by: int
    updated_by: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PushResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None
