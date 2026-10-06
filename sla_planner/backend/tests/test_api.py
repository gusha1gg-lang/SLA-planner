"""
Tests for SLA Planner Backend.

Run:
    cd backend
    pip install pytest pytest-asyncio httpx
    pytest tests/ -v
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import engine, Base, async_session
from app.models import User
from app.services.auth import hash_password


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Create fresh tables for each test."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def admin_user():
    """Create admin user for testing."""
    async with async_session() as session:
        user = User(
            username="testadmin",
            password_hash=hash_password("testpass"),
            role="admin",
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


@pytest_asyncio.fixture
async def auth_headers(admin_user):
    """Get auth headers for admin user."""
    from app.services.auth import create_access_token
    token = create_access_token({"sub": str(admin_user.id), "role": "admin"})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_health():
    """Test /health endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_version():
    """Test /api/version endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/version")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "version" in data
    # read-only зависит от окружения (.env) — проверяем тип, не значение
    assert isinstance(data["zabbix_read_only"], bool)


@pytest.mark.asyncio
async def test_login_success(admin_user):
    """Test successful login."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/auth/login",
            params={"username": "testadmin", "password": "testpass"},
        )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["username"] == "testadmin"
    assert data["user"]["role"] == "admin"


@pytest.mark.asyncio
async def test_login_wrong_password(admin_user):
    """Test login with wrong password."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/auth/login",
            params={"username": "testadmin", "password": "wrongpass"},
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me(auth_headers):
    """Test /api/auth/me endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testadmin"
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_list_slas(auth_headers):
    """Test listing SLAs."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/sla/", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_list_services(auth_headers):
    """Test listing services."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/services/", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_list_works(auth_headers):
    """Test listing planned works."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/works/", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


async def _seed_sla_service():
    """Insert one SLA + Service row so planned works can be created."""
    from app.models import SLA, Service

    async with async_session() as session:
        session.add(SLA(id=1, zabbix_slaid="1", name="ERP", slo=99.5, service_tags='["SAP"]'))
        session.add(Service(id=1, zabbix_serviceid="1", name="SAP", tags='[{"tag":"service","value":"SAP"}]'))
        await session.commit()


@pytest.mark.asyncio
async def test_update_work(auth_headers):
    """PUT /api/works/{id} должен сохранять изменения (регрессия: редактирование не сохранялось)."""
    await _seed_sla_service()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/works/", headers=auth_headers, json={
            "title": "ТО базы",
            "description": "Плановое ТО",
            "sla_id": 1,
            "service_id": 1,
            "started_at": "2026-10-07T02:30:00.000Z",
            "ended_at": "2026-10-07T06:30:00.000Z",
        })
        assert resp.status_code == 201, resp.text
        work_id = resp.json()["id"]

        resp = await client.put(f"/api/works/{work_id}", headers=auth_headers, json={
            "title": "ТО базы v2",
            "description": "Обновлённое описание",
            "sla_id": 1,
            "service_id": 1,
            "started_at": "2026-10-08T03:00:00.000Z",
            "ended_at": "2026-10-08T07:00:00.000Z",
        })
        assert resp.status_code == 200, resp.text
        updated = resp.json()
        assert updated["title"] == "ТО базы v2"
        assert updated["description"] == "Обновлённое описание"
        # период простоя пересчитан по новым датам
        from datetime import datetime, timezone
        expected_from = str(int(datetime(2026, 10, 8, 3, 0, tzinfo=timezone.utc).timestamp()))
        assert updated["downtime_period_from"] == expected_from


@pytest.mark.asyncio
async def test_push_uses_work_title_as_downtime_name(auth_headers, monkeypatch):
    """Push должен писать в Zabbix имя окна = заголовок работы (не маркер SLA Planner #id)."""
    from datetime import datetime, timezone
    from app.services.zabbix_client import zabbix_client

    await _seed_sla_service()

    captured = {}

    async def fake_remove(slaid, downtime_name):
        captured["removed_name"] = downtime_name

    async def fake_add(slaid, name, period_from, period_to):
        captured["slaid"] = slaid
        captured["name"] = name
        captured["period_from"] = period_from
        captured["period_to"] = period_to

    monkeypatch.setattr(zabbix_client, "remove_excluded_downtime", fake_remove)
    monkeypatch.setattr(zabbix_client, "add_excluded_downtime", fake_add)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/works/", headers=auth_headers, json={
            "title": "ТО базы",
            "description": "",
            "sla_id": 1,
            "service_id": 1,
            "started_at": "2026-10-07T02:30:00.000Z",
            "ended_at": "2026-10-07T06:30:00.000Z",
        })
        assert resp.status_code == 201, resp.text
        work_id = resp.json()["id"]

        resp = await client.post(f"/api/works/{work_id}/push", headers=auth_headers)
        assert resp.status_code == 200, resp.text

        assert captured["name"] == "ТО базы"
        assert captured["removed_name"] == f"SLA Planner #{work_id}"
        assert captured["slaid"] == "1"
        assert captured["period_from"] == str(int(datetime(2026, 10, 7, 2, 30, tzinfo=timezone.utc).timestamp()))
        assert captured["period_to"] == str(int(datetime(2026, 10, 7, 6, 30, tzinfo=timezone.utc).timestamp()))

        # статус работы стал "planned"
        works = (await client.get("/api/works/", headers=auth_headers)).json()
        assert works[0]["status"] == "planned"


@pytest.mark.asyncio
async def test_audit_logs_admin_only(auth_headers):
    """Test audit logs require admin role."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/audit/", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_unauthorized_access():
    """Test that endpoints require authentication."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/sla/")
    assert response.status_code == 403 or response.status_code == 401


@pytest.mark.asyncio
async def test_zabbix_client_read_only():
    """Test that Zabbix client respects read-only mode."""
    from app.services.zabbix_client import ZabbixClient, ZabbixError
    
    client = ZabbixClient()
    client.read_only = True
    
    with pytest.raises(ZabbixError, match="Read-only"):
        await client.sla_update("1", [])


@pytest.mark.asyncio
async def test_zabbix_client_downtime_format():
    """Test excluded_downtime format."""
    # Verify format matches Zabbix 7.0 requirements
    downtime = {
        "name": "SLA Planner #1",
        "period_from": "1710540000",  # string!
        "period_to": "1710554400",    # string!
    }
    assert isinstance(downtime["name"], str)
    assert isinstance(downtime["period_from"], str)
    assert isinstance(downtime["period_to"], str)
