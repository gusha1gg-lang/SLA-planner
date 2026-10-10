"""Модели групп (команд) и связей пользователь↔группа.

Модель прав в стиле Grafana: у «пользователя» права приходят из групп,
в которых он состоит (сумма прав); у «админа» права полные без групп.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Boolean
from sqlalchemy.sql import func

from app.database import Base


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(String(255), default="")
    # JSON-список прав (флагов из app.permissions), например '["dashboard","works"]'
    permissions = Column(Text, default="[]")
    # Системная группа (создаётся seed'ом) — защищена от удаления
    is_system = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserGroup(Base):
    """Связь «пользователь состоит в группе» (многие-ко-многим)."""

    __tablename__ = "user_groups"

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    group_id = Column(
        Integer,
        ForeignKey("groups.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())