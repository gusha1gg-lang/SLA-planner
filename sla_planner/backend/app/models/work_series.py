from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class WorkSeries(Base):
    """Шаблон цикличной плановой работы (еженедельно по дням недели).

    Вхождения — обычные `planned_works` со ссылкой `series_id`; они генерируются
    на горизонт вперёд и продлеваются фоновым планировщиком
    (см. `app/services/recurrence.py`). Редактируется/удаляется серия целиком.
    """

    __tablename__ = "work_series"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=False)
    sla_id = Column(Integer, ForeignKey("slas.id"), nullable=False)
    # Дни недели через запятую, 0=Пн .. 6=Вс (как datetime.weekday()).
    weekdays = Column(String(20), nullable=False)
    # Время начала в МСК, "HH:MM".
    start_time = Column(String(5), nullable=False)
    duration_minutes = Column(Integer, nullable=False, default=60)
    active = Column(Boolean, nullable=False, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
