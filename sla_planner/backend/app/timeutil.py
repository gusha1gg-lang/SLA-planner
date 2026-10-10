"""Утилиты времени: единый UTC-формат для API.

SQLite не хранит часовой пояс: `DateTime(timezone=True)` + `server_default=func.now()`
возвращает *naive* UTC. Если отдавать его в JSON как есть, браузер по умолчанию
трактует строку как локальное время и все метки уезжают на смещение зоны (для МСК — на 3 часа).

Поэтому наружу всегда отдаём ISO-8601 с явной зоной (helper `iso_utc`), а входящие
строки приводим к UTC (`parse_utc`) — независимо от того, с какой зоной пришёл клиент.
"""

from datetime import datetime, timezone


def iso_utc(dt: datetime | None) -> str | None:
    """ISO-8601 в UTC с явной зоной. Naive-время считаем UTC (как пишет SQLite)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat()


def parse_utc(value: str) -> datetime:
    """Разобрать ISO-строку и привести к aware-UTC.

    `Z` и смещения поддерживаются; naive-строку трактуем как UTC.
    """
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)
