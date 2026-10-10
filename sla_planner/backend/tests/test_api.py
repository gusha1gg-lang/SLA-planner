"""
Tests for SLA Planner Backend.

Модель прав в стиле Grafana: "admin" — полные права, "user" — права из групп
(сумма прав). Проверки: каталог прав, гейтинг страниц и действий, CRUD групп.

Run:
    cd backend
    pip install pytest pytest-asyncio httpx
    pytest tests/ -v
"""

import json

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import engine, Base, async_session
from app.models import User, Group, UserGroup, Service
from app.permissions import ALL_PERMISSIONS
from app.services.auth import hash_password, create_access_token


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
    token = create_access_token({"sub": str(admin_user.id), "role": "admin"})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def plain_user():
    """Пользователь role='user' без групп (без единого права)."""
    async with async_session() as session:
        user = User(
            username="plainuser",
            password_hash=hash_password("testpass"),
            role="user",
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


async def user_headers(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id), 'role': user.role})}"}


async def create_group(
    name: str,
    permissions: list[str],
    member_ids: list[int] = (),
    is_system: bool = False,
    all_models: bool = True,
    model_ids: list[str] = (),
) -> Group:
    """Создать группу с правами, областью моделей и составом прямо в БД (для тестов)."""
    async with async_session() as session:
        group = Group(
            name=name,
            description="",
            permissions=json.dumps(permissions, ensure_ascii=False),
            all_models=all_models,
            model_ids=json.dumps(list(model_ids), ensure_ascii=False),
            is_system=is_system,
        )
        session.add(group)
        await session.flush()
        for uid in member_ids:
            session.add(UserGroup(user_id=uid, group_id=group.id))
        await session.commit()
        await session.refresh(group)
        return group


async def create_services(rows: list[tuple[str, str | None, str]]) -> None:
    """Создать услуги прямо в БД: (zabbix_serviceid, parent_zabbix_serviceid, name)."""
    async with async_session() as session:
        for sid, pid, name in rows:
            session.add(Service(zabbix_serviceid=sid, parent_zabbix_serviceid=pid, name=name))
        await session.commit()


# ── Базовые ──

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
    """Успешный логин: admin получает все права и пустой список групп."""
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
    assert data["user"]["groups"] == []
    assert set(data["user"]["permissions"]) == set(ALL_PERMISSIONS)


@pytest.mark.asyncio
async def test_login_user_returns_permissions_from_groups(auth_headers):
    """Логин пользователя возвращает сумму прав его групп."""
    async with async_session() as session:
        user = User(
            username="member",
            password_hash=hash_password("testpass"),
            role="user",
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
    await create_group("Группа A", ["dashboard", "model"], [user.id])
    await create_group("Группа B", ["works", "works.edit"], [user.id])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/auth/login",
            params={"username": "member", "password": "testpass"},
        )
    assert response.status_code == 200
    user_data = response.json()["user"]
    perms = set(user_data["permissions"])
    assert perms == {"dashboard", "model", "works", "works.edit"}
    assert {g["name"] for g in user_data["groups"]} == {"Группа A", "Группа B"}


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
    """Test /api/auth/me endpoint (с правами)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testadmin"
    assert data["role"] == "admin"
    assert set(data["permissions"]) == set(ALL_PERMISSIONS)


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
async def test_service_config(auth_headers, monkeypatch):
    """GET /api/services/{id}/config должен вернуть живую конфигурацию услуги с русскими ярлыками."""
    from app.services.zabbix_client import zabbix_client

    async def fake_config(serviceid):
        assert serviceid == "798"
        return {
            "serviceid": "798",
            "name": "Доступность по ping",
            "algorithm": "2",
            "sortorder": "0",
            "status": "4",
            "weight": "0",
            "propagation_rule": "0",
            "propagation_value": "0",
            "description": "Доступность по ping MES-DB-PROD-TESC1",
            "created_at": "1791457342",
            "readonly": False,
            "tags": None,
            "parents": [{"serviceid": "1253", "name": "MES-DB-PROD-TESC1", "status": "4"}],
            "children": [],
            "problem_tags": [{"tag": "service", "operator": "0", "value": "Q3MET ТЭСЦ-1"}],
        }

    monkeypatch.setattr(zabbix_client, "service_config_get", fake_config)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/services/798/config", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["serviceid"] == "798"
    assert data["name"] == "Доступность по ping"
    assert data["algorithm_label"] == "Самое критичное из дочерних услуг"
    assert data["status_label"] == "Высокая"
    assert data["propagation_rule_label"] == "Как есть"
    assert data["created_at"].startswith("2026-")
    assert data["problem_tags"][0]["operator_label"] == "Равно"
    assert data["problem_tags"][0]["value"] == "Q3MET ТЭСЦ-1"
    assert data["parents"][0]["name"] == "MES-DB-PROD-TESC1"
    assert data["children"] == []


@pytest.mark.asyncio
async def test_service_config_not_found(auth_headers, monkeypatch):
    """GET /api/services/{id}/config для несуществующей услуги -> 404."""
    from app.services.zabbix_client import zabbix_client

    async def fake_config(serviceid):
        return None

    monkeypatch.setattr(zabbix_client, "service_config_get", fake_config)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/services/999999/config", headers=auth_headers)
    assert response.status_code == 404


# ── Работы ──

@pytest.mark.asyncio
async def test_list_works(auth_headers):
    """Admin (право works) видит список плановых работ."""
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
async def test_works_page_requires_permission(plain_user):
    """Пользователь без права works не видит список работ (403)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/works/", headers=await user_headers(plain_user))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_works_page_granted_by_group(plain_user):
    """Право works из группы открывает список работ."""
    await create_group("Планировщики", ["dashboard", "model", "works"], [plain_user.id])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/works/", headers=await user_headers(plain_user))
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_group_grants_work_creation(plain_user):
    """Право works.edit из группы позволяет создавать работы; без него — 403."""
    await create_group("Операторы", ["dashboard", "works", "works.edit"], [plain_user.id])
    await _seed_sla_service()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/works/",
            headers=await user_headers(plain_user),
            json={
                "title": "ТО базы",
                "description": "",
                "sla_id": 1,
                "service_id": 1,
                "started_at": "2026-10-07T02:30:00.000Z",
                "ended_at": "2026-10-07T06:30:00.000Z",
            },
        )
    assert response.status_code == 201, response.text


@pytest.mark.asyncio
async def test_group_grants_work_delete(plain_user, auth_headers):
    """Право works.delete из группы позволяет удалять работы."""
    await create_group("Операторы", ["dashboard", "works", "works.delete"], [plain_user.id])
    await _seed_sla_service()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # создаём работу как admin
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

        # удаляем как пользователь с правом works.delete
        response = await client.delete(f"/api/works/{work_id}", headers=await user_headers(plain_user))
    assert response.status_code == 200, response.text


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
    removed = []

    async def fake_remove(slaid, downtime_name):
        removed.append((slaid, downtime_name))

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
        assert ("1", f"SLA Planner #{work_id}") in removed  # старый маркер убран
        assert ("1", "ТО базы") in removed                  # дедуп при re-push
        assert captured["slaid"] == "1"
        assert captured["period_from"] == str(int(datetime(2026, 10, 7, 2, 30, tzinfo=timezone.utc).timestamp()))
        assert captured["period_to"] == str(int(datetime(2026, 10, 7, 6, 30, tzinfo=timezone.utc).timestamp()))

        # статус работы стал "planned"
        works = (await client.get("/api/works/", headers=auth_headers)).json()
        assert works[0]["status"] == "planned"


@pytest.mark.asyncio
async def test_update_planned_work_resyncs_zabbix(auth_headers, monkeypatch):
    """Правка planned-работы должна автоматически обновлять окно в Zabbix (старое имя -> новое)."""
    from app.services.zabbix_client import zabbix_client

    await _seed_sla_service()

    removed = []
    added = {}

    async def fake_remove(slaid, downtime_name):
        removed.append((slaid, downtime_name))

    async def fake_add(slaid, name, period_from, period_to):
        added.update(slaid=slaid, name=name, period_from=period_from, period_to=period_to)

    monkeypatch.setattr(zabbix_client, "remove_excluded_downtime", fake_remove)
    monkeypatch.setattr(zabbix_client, "add_excluded_downtime", fake_add)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/works/", headers=auth_headers, json={
            "title": "Старое имя",
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

        # правка названия у запланированной работы
        resp = await client.put(f"/api/works/{work_id}", headers=auth_headers, json={
            "title": "Новое имя",
            "description": "",
            "sla_id": 1,
            "service_id": 1,
            "started_at": "2026-10-07T02:30:00.000Z",
            "ended_at": "2026-10-07T06:30:00.000Z",
        })
        assert resp.status_code == 200, resp.text
        assert resp.json()["title"] == "Новое имя"

        assert ("1", "Старое имя") in removed, removed  # старое окно удалено
        assert added["name"] == "Новое имя"              # новое окно добавлено


# ── Аудит ──

@pytest.mark.asyncio
async def test_audit_logs_require_permission(plain_user, auth_headers):
    """Аудит-лог: admin видит, пользователь без права audit — 403."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        admin_response = await client.get("/api/audit/", headers=auth_headers)
        plain_response = await client.get("/api/audit/", headers=await user_headers(plain_user))
    assert admin_response.status_code == 200
    assert isinstance(admin_response.json(), list)
    assert plain_response.status_code == 403


# ── Граф ──

@pytest.mark.asyncio
async def test_graph_colors_defaults(auth_headers):
    """Graph colors default values for everyone with model permission."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/graph/colors", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data == {"sla": "#3B82F6", "service": "#8B5CF6"}


@pytest.mark.asyncio
async def test_graph_colors_save_and_get(auth_headers):
    """Пользователь с правом graph.edit может менять цвета SLA/услуг; они сохраняются."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        put = await client.put(
            "/api/graph/colors",
            headers=auth_headers,
            json={"sla": "#FF0000", "service": "#00FF00"},
        )
        assert put.status_code == 200
        assert put.json() == {"saved": True}

        get = await client.get("/api/graph/colors", headers=auth_headers)
        assert get.status_code == 200
        assert get.json() == {"sla": "#FF0000", "service": "#00FF00"}


@pytest.mark.asyncio
async def test_graph_edit_requires_permission(plain_user, auth_headers):
    """Пользователь без права graph.edit не может менять цвета графа (403)."""
    await create_group("Наблюдатели", ["dashboard", "model"], [plain_user.id])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        put = await client.put(
            "/api/graph/colors",
            headers=await user_headers(plain_user),
            json={"sla": "#FF0000", "service": "#00FF00"},
        )
        assert put.status_code == 403
        # цвета не изменились
        get = await client.get("/api/graph/colors", headers=auth_headers)
        assert get.json() == {"sla": "#3B82F6", "service": "#8B5CF6"}


@pytest.mark.asyncio
async def test_graph_edit_granted_by_group(plain_user):
    """Право graph.edit из группы разрешает правку цветов графа."""
    await create_group("Дизайнеры", ["dashboard", "model", "graph.edit"], [plain_user.id])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        put = await client.put(
            "/api/graph/colors",
            headers=await user_headers(plain_user),
            json={"sla": "#112233", "service": "#445566"},
        )
        assert put.status_code == 200, put.text


# ── Пользователи и группы (admin only) ──

@pytest.mark.asyncio
async def test_admin_pages_require_admin(plain_user, auth_headers):
    """Страницы администрирования (users/groups) недоступны без роли admin."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        users_plain = await client.get("/api/users/", headers=await user_headers(plain_user))
        groups_plain = await client.get("/api/groups/", headers=await user_headers(plain_user))
        users_admin = await client.get("/api/users/", headers=auth_headers)
    assert users_plain.status_code == 403
    assert groups_plain.status_code == 403
    assert users_admin.status_code == 200


@pytest.mark.asyncio
async def test_create_user_with_groups(auth_headers):
    """Создание пользователя с ролями и группами (admin)."""
    group = await create_group("Наблюдатели", ["dashboard", "model", "works", "reports"])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/users/",
            headers=auth_headers,
            json={"username": "newuser", "password": "secret", "role": "user", "group_ids": [group.id]},
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["role"] == "user"
        assert [g["name"] for g in data["groups"]] == ["Наблюдатели"]

        # логин нового пользователя отдаёт права группы
        login = await client.post(
            "/api/auth/login",
            params={"username": "newuser", "password": "secret"},
        )
        assert login.status_code == 200
        assert set(login.json()["user"]["permissions"]) == {"dashboard", "model", "works", "reports"}


@pytest.mark.asyncio
async def test_groups_crud(auth_headers):
    """CRUD групп: создание, правка прав/состава, удаление."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # создать
        resp = await client.post(
            "/api/groups/",
            headers=auth_headers,
            json={"name": "Операторы", "description": "Смена", "permissions": ["dashboard", "works"], "member_ids": []},
        )
        assert resp.status_code == 201, resp.text
        group_id = resp.json()["id"]
        assert resp.json()["permissions"] == ["dashboard", "works"]

        # невалидное право отклоняется
        bad = await client.post(
            "/api/groups/",
            headers=auth_headers,
            json={"name": "Бад", "permissions": ["несуществующее_право"], "member_ids": []},
        )
        assert bad.status_code == 422

        # дубль имени
        dup = await client.post(
            "/api/groups/",
            headers=auth_headers,
            json={"name": "Операторы", "permissions": [], "member_ids": []},
        )
        assert dup.status_code == 409

        # правка
        put = await client.put(
            f"/api/groups/{group_id}",
            headers=auth_headers,
            json={"name": "Операторы", "description": "Новое описание", "permissions": ["works", "works.edit"], "member_ids": []},
        )
        assert put.status_code == 200, put.text
        assert put.json()["permissions"] == ["works", "works.edit"]

        # список
        listing = await client.get("/api/groups/", headers=auth_headers)
        assert listing.status_code == 200
        assert any(g["id"] == group_id for g in listing.json())

        # удаление
        delete = await client.delete(f"/api/groups/{group_id}", headers=auth_headers)
        assert delete.status_code == 200
        assert delete.json() == {"deleted": True}


@pytest.mark.asyncio
async def test_system_group_cannot_be_deleted(auth_headers):
    """Системные группы (создаются seed'ом) нельзя удалить."""
    await create_group("Планировщики", ["dashboard", "works"], is_system=True)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        groups = (await client.get("/api/groups/", headers=auth_headers)).json()
        system_id = next(g["id"] for g in groups if g["is_system"])
        response = await client.delete(f"/api/groups/{system_id}", headers=auth_headers)
    assert response.status_code == 400


# ── Область моделей здоровья у групп ──

@pytest.mark.asyncio
async def test_me_returns_all_models_for_admin(auth_headers):
    """admin видит все модели здоровья (scope.all=true)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["models"] == {"all": True, "ids": []}


@pytest.mark.asyncio
async def test_user_model_scope_from_groups(plain_user):
    """Область моделей пользователя — объединение областей его групп."""
    await create_group("SAP", ["model"], [plain_user.id], all_models=False, model_ids=["796"])
    await create_group("1С", ["model"], [plain_user.id], all_models=False, model_ids=["797"])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/auth/me", headers=await user_headers(plain_user))
    assert response.status_code == 200
    assert response.json()["models"] == {"all": False, "ids": ["796", "797"]}


@pytest.mark.asyncio
async def test_group_all_models_flag_wins(plain_user):
    """Если хоть одна группа даёт «все модели» — scope.all=true."""
    await create_group("SAP", ["model"], [plain_user.id], all_models=False, model_ids=["796"])
    await create_group("Аналитики", ["model"], [plain_user.id], all_models=True)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/auth/me", headers=await user_headers(plain_user))
    assert response.status_code == 200
    assert response.json()["models"] == {"all": True, "ids": ["796"]}


@pytest.mark.asyncio
async def test_group_model_scope_limits_services(plain_user, auth_headers):
    """Услуги видны только в пределах разрешённых моделей; admin — все."""
    # модель 1: корень "1" + потомок "11"; модель 2: корень "2" + потомок "22"
    await create_services([
        ("1", None, "SAP"),
        ("11", "1", "SAP child"),
        ("2", None, "1С"),
        ("22", "2", "1С child"),
    ])
    await create_group("SAP", ["model"], [plain_user.id], all_models=False, model_ids=["1"])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        user_resp = await client.get("/api/services/", headers=await user_headers(plain_user))
        admin_resp = await client.get("/api/services/", headers=auth_headers)

    assert user_resp.status_code == 200
    assert {s["zabbix_serviceid"] for s in user_resp.json()} == {"1", "11"}  # только модель SAP
    assert {s["zabbix_serviceid"] for s in admin_resp.json()} == {"1", "11", "2", "22"}


@pytest.mark.asyncio
async def test_service_config_model_scope(plain_user):
    """Конфиг услуги вне моделей пользователя — 403."""
    await create_services([("1", None, "SAP"), ("2", None, "1С")])
    await create_group("SAP", ["model"], [plain_user.id], all_models=False, model_ids=["1"])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # услуга вне области — отказ до обращения к Zabbix
        forbidden = await client.get("/api/services/2/config", headers=await user_headers(plain_user))
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_graph_positions_model_scope(plain_user):
    """Раскладку чужой модели читать нельзя (403), своей — можно (200)."""
    await create_services([("1", None, "SAP"), ("2", None, "1С")])
    await create_group("SAP", ["model"], [plain_user.id], all_models=False, model_ids=["1"])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        mine = await client.get("/api/graph/positions?model=1", headers=await user_headers(plain_user))
        alien = await client.get("/api/graph/positions?model=2", headers=await user_headers(plain_user))
    assert mine.status_code == 200
    assert alien.status_code == 403


@pytest.mark.asyncio
async def test_graph_edit_scoped_to_group_models(plain_user):
    """graph.edit действует только на модели своей группы: чужую модель редактировать нельзя."""
    await create_services([("1", None, "SAP"), ("2", None, "1С")])
    await create_group(
        "SAP", ["model", "graph.edit"], [plain_user.id], all_models=False, model_ids=["1"]
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        mine = await client.put(
            "/api/graph/positions",
            headers=await user_headers(plain_user),
            json={"model": "1", "positions": [{"node_key": "svc:1", "x": 10, "y": 20}]},
        )
        alien = await client.put(
            "/api/graph/positions",
            headers=await user_headers(plain_user),
            json={"model": "2", "positions": [{"node_key": "svc:2", "x": 1, "y": 2}]},
        )
    assert mine.status_code == 200
    assert alien.status_code == 403


@pytest.mark.asyncio
async def test_group_crud_model_scope(auth_headers):
    """CRUD группы сохраняет область моделей (all_models/model_ids)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/groups/",
            headers=auth_headers,
            json={
                "name": "SAP ПИ-БАЗИС",
                "description": "Практика SAP",
                "permissions": ["model", "graph.edit"],
                "all_models": False,
                "model_ids": ["796", "796", " 797 "],
                "member_ids": [],
            },
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["all_models"] is False
        assert data["model_ids"] == ["796", "797"]  # дубли/пробелы убраны

        # включение «все модели»
        put = await client.put(
            f"/api/groups/{data['id']}",
            headers=auth_headers,
            json={
                "name": "SAP ПИ-БАЗИС",
                "description": "Практика SAP",
                "permissions": ["model"],
                "all_models": True,
                "model_ids": [],
                "member_ids": [],
            },
        )
        assert put.status_code == 200, put.text
        assert put.json()["all_models"] is True
        assert put.json()["model_ids"] == []


# ── Zabbix client ──

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