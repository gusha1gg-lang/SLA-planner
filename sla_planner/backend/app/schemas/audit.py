"""Pydantic schemas for AuditLog."""

from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    payload: Optional[Dict[str, Any]] = None
    result: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
