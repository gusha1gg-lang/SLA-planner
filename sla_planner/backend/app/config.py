from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "SLA Planner"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./sla_planner.db"
    # Для PostgreSQL:
    # DATABASE_URL: str = "postgresql+asyncpg://user:pass@localhost:5432/sla_planner"

    # JWT
    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    # Zabbix
    ZABBIX_API_URL: str = ""
    ZABBIX_API_TOKEN: str = ""
    ZABBIX_READ_ONLY: bool = True  # На проде — True по умолчанию

    # Timezone
    DEFAULT_TIMEZONE: str = "Europe/Moscow"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
