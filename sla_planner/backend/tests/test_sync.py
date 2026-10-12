"""
Тесты синхронизации Zabbix ↔ БД (app/services/sync.py):
bulk-upsert, prune, построение связей по тегам.

Run (из каталога sla_planner/backend):
    DATABASE_URL=sqlite+aiosqlite:///./test_sla.db venv/bin/python -m pytest tests/test_sync.py -v
"""

import asyncio
import json

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.database import engine, Base, async_session
from app.models import SLA, Service, SlaServiceLink
from app.services import sync as sync_mod
from app.services.sync import sync_slas, sync_services, sync_sla_service_links


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Чистые таблицы на каждый тест (изолированная SQLite-БД)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _fetch_slas() -> list[SLA]:
    async with async_session() as session:
        return list((await session.execute(select(SLA).order_by(SLA.zabbix_slaid))).scalars())


async def _fetch_services() -> list[Service]:
    async with async_session() as session:
        return list(
            (await session.execute(select(Service).order_by(Service.zabbix_serviceid))).scalars()
        )


async def _fetch_links() -> list[SlaServiceLink]:
    async with async_session() as session:
        return list((await session.execute(select(SlaServiceLink))).scalars())


@pytest.mark.asyncio
async def test_sync_slas_bulk_upsert_and_prune(monkeypatch):
    """Вставка пачкой, повторный синк обновляет (не дублирует), лишнее прунится."""
    fake = [
        {"slaid": "1", "name": "ERP-1", "slo": "99.5", "period": "24x7",
         "service_tags": [{"tag": "service", "value": "SAP"}]},
        {"slaid": "2", "name": "ERP-2", "slo": "97.0", "period": "24x7",
         "service_tags": []},
    ]

    async def fake_sla_get():
        return fake

    monkeypatch.setattr(sync_mod.zabbix_client, "sla_get", fake_sla_get)

    # SLA "3" есть в БД, но его нет в Zabbix — prune должен его удалить.
    async with async_session() as session:
        session.add(SLA(zabbix_slaid="3", name="Старый", slo=50.0, service_tags=None))
        await session.commit()

    async with async_session() as session:
        count = await sync_slas(session)
        assert count == 2
        await session.commit()

    slas = await _fetch_slas()
    assert [s.zabbix_slaid for s in slas] == ["1", "2"]
    assert slas[0].name == "ERP-1" and slas[0].slo == 99.5
    assert json.loads(slas[0].service_tags)[0]["value"] == "SAP"
    assert slas[1].service_tags is None  # пустые теги → NULL (как и раньше)

    # Повторный синк: имя изменилось — строка обновляется, дублей нет.
    fake[0]["name"] = "ERP-новое"
    async with async_session() as session:
        count = await sync_slas(session)
        assert count == 2
        await session.commit()

    slas = await _fetch_slas()
    assert [s.zabbix_slaid for s in slas] == ["1", "2"]
    assert slas[0].name == "ERP-новое"


@pytest.mark.asyncio
async def test_sync_services_bulk_upsert_parents_and_prune(monkeypatch):
    """Услуги: bulk-вставка, родитель из parents[], prune лишних."""
    fake = [
        {"serviceid": "10", "name": "Корень", "algorithm": "2", "sortorder": "1",
         "status": "-1", "tags": [{"tag": "service", "value": "A"}], "parents": []},
        {"serviceid": "11", "name": "Дочерний", "algorithm": "0", "sortorder": "2",
         "status": "0", "tags": [], "parents": [{"serviceid": "10"}]},
    ]

    async def fake_service_get():
        return fake

    monkeypatch.setattr(sync_mod.zabbix_client, "service_get", fake_service_get)

    async with async_session() as session:
        session.add(Service(zabbix_serviceid="99", name="Старая", tags="[]"))
        await session.commit()

    async with async_session() as session:
        count = await sync_services(session)
        assert count == 2
        await session.commit()

    services = await _fetch_services()
    assert [s.zabbix_serviceid for s in services] == ["10", "11"]
    root = next(s for s in services if s.zabbix_serviceid == "10")
    child = next(s for s in services if s.zabbix_serviceid == "11")
    assert root.parent_zabbix_serviceid is None
    assert child.parent_zabbix_serviceid == "10"
    assert root.algorithm == "2" and root.sortorder == 1 and root.status == -1


@pytest.mark.asyncio
async def test_sync_links_built_via_tags_case_insensitive():
    """Связи строятся по тегу `service` без учёта регистра; чужие теги не дают связей."""
    async with async_session() as session:
        session.add(SLA(zabbix_slaid="1", name="ERP", slo=99.5,
                        service_tags=json.dumps([{"tag": "service", "value": "SAP"}])))
        session.add(SLA(zabbix_slaid="2", name="Другой", slo=90.0,
                        service_tags=json.dumps([{"tag": "service", "value": "abc"}])))
        session.add(Service(zabbix_serviceid="10", name="SAP",
                            tags=json.dumps([{"tag": "service", "value": "sap"}])))
        session.add(Service(zabbix_serviceid="11", name="Прочее",
                            tags=json.dumps([{"tag": "app", "value": "x"}])))
        await session.commit()

    async with async_session() as session:
        count = await sync_sla_service_links(session)
        assert count == 1
        await session.commit()

    links = await _fetch_links()
    assert len(links) == 1
    link = links[0]
    assert link.sla_id == 1  # ERP («SAP») ↔ услуга «sap» (регистр не важен)
    assert link.service_id == 1  # id-1 услуги «SAP» в БД теста


@pytest.mark.asyncio
async def test_full_sync_end_to_end(monkeypatch):
    """Полный синк: SLA + услуги + связи; старые объекты прунятся."""
    async def fake_sla_get():
        return [
            {"slaid": "1", "name": "SLA-1", "slo": "99.0", "period": "24x7",
             "service_tags": [{"tag": "service", "value": "svc-1"}]},
        ]

    async def fake_service_get():
        return [
            {"serviceid": "101", "name": "Услуга-1", "algorithm": "0", "sortorder": "0",
             "status": "-1", "tags": [{"tag": "service", "value": "svc-1"}], "parents": []},
        ]

    monkeypatch.setattr(sync_mod.zabbix_client, "sla_get", fake_sla_get)
    monkeypatch.setattr(sync_mod.zabbix_client, "service_get", fake_service_get)

    # Мусор в БД: SLA "9", услуга "999" — должны быть прунены.
    async with async_session() as session:
        session.add(SLA(zabbix_slaid="9", name="Старый SLA", slo=50.0))
        session.add(Service(zabbix_serviceid="999", name="Старая услуга", tags="[]"))
        await session.commit()

    async with async_session() as session:
        result = await sync_mod.full_sync(session)
        await session.commit()

    assert result == {"slas": 1, "services": 1, "links": 1}

    slas = await _fetch_slas()
    services = await _fetch_services()
    links = await _fetch_links()
    assert [s.zabbix_slaid for s in slas] == ["1"]
    assert [s.zabbix_serviceid for s in services] == ["101"]
    assert len(links) == 1
    assert links[0].sla_id == slas[0].id
    assert links[0].service_id == services[0].id


# ── Автосинхронизация по расписанию (пункт 1) ──


@pytest.mark.asyncio
async def test_auto_sync_loop_ticks(monkeypatch):
    """Планировщик автосинка на каждом тике запускает полный синк."""
    calls: list[int] = []
    monkeypatch.setattr(sync_mod, "start_full_sync", lambda: (calls.append(1), True)[1])

    task = asyncio.create_task(sync_mod._auto_sync_loop(0.01))
    try:
        await asyncio.sleep(0.06)
    finally:
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    sync_mod._auto_next_run = None

    assert len(calls) >= 1


@pytest.mark.asyncio
async def test_auto_sync_disabled_by_config(monkeypatch):
    """SYNC_AUTO_ENABLED=false — планировщик не создаётся, статус это отражает."""
    from app.config import settings

    monkeypatch.setattr(settings, "SYNC_AUTO_ENABLED", False)
    monkeypatch.setattr(sync_mod, "_auto_enabled", False)
    monkeypatch.setattr(sync_mod, "_auto_sync_task", None)

    sync_mod.start_auto_sync()

    assert sync_mod._auto_sync_task is None
    assert sync_mod.get_sync_status()["scheduler"]["enabled"] is False


@pytest.mark.asyncio
async def test_auto_sync_enabled_start_and_stop(monkeypatch):
    """Включённый автосинк стартует задачу, статус отдаёт расписание, stop гасит её."""
    from app.config import settings

    monkeypatch.setattr(settings, "SYNC_AUTO_ENABLED", True)
    monkeypatch.setattr(settings, "SYNC_AUTO_INTERVAL_MINUTES", 60)
    monkeypatch.setattr(sync_mod, "_auto_sync_task", None)

    sync_mod.start_auto_sync()
    try:
        assert sync_mod._auto_sync_task is not None
        scheduler = sync_mod.get_sync_status()["scheduler"]
        assert scheduler["enabled"] is True
        assert scheduler["interval_minutes"] == 60
    finally:
        await sync_mod.stop_auto_sync()

    assert sync_mod._auto_sync_task is None
    assert sync_mod._auto_enabled is False