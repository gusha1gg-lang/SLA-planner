"""SLA Planner — FastAPI Application."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db
from app.services.sync import SyncInProgressError, start_auto_sync, stop_auto_sync

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown."""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    await init_db()
    start_auto_sync()
    yield
    await stop_auto_sync()
    logger.info("Shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Ошибки: синк уже идёт → 409 с понятным сообщением, а не 500 ──

@app.exception_handler(SyncInProgressError)
async def sync_in_progress_handler(request: Request, exc: SyncInProgressError):
    """Параллельный синк отклонить (лок занят другим синком или воркером)."""
    return JSONResponse(status_code=409, content={"detail": "Синхронизация уже выполняется"})


# ── Health & Version ──

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/version")
async def version():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "zabbix_read_only": settings.ZABBIX_READ_ONLY,
    }


@app.get("/api/zabbix/status")
async def zabbix_status():
    """Проверить подключение к Zabbix."""
    from app.services.zabbix_client import zabbix_client
    try:
        is_connected = await zabbix_client.ping()
        return {
            "connected": is_connected,
            "read_only": settings.ZABBIX_READ_ONLY,
            "api_url": settings.ZABBIX_API_URL,
        }
    except Exception as e:
        return {
            "connected": False,
            "read_only": settings.ZABBIX_READ_ONLY,
            "error": str(e),
        }


# ── Routers ──
from app.routers import auth, sla, services, planned_works, audit, users, sync, graph, groups

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(sla.router, prefix="/api/sla", tags=["sla"])
app.include_router(services.router, prefix="/api/services", tags=["services"])
app.include_router(planned_works.router, prefix="/api/works", tags=["planned_works"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(groups.router, prefix="/api/groups", tags=["groups"])
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
app.include_router(graph.router, prefix="/api/graph", tags=["graph"])
