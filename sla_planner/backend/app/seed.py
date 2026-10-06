"""
Seed script — populate database with test data.

Usage:
    cd backend
    python -m app.seed
"""

import asyncio
import json
from datetime import datetime, timezone

from app.database import async_session, init_db
from app.models.user import User
from app.models.sla import SLA
from app.models.service import Service
from app.models.sla_service_link import SlaServiceLink
from app.models.planned_work import PlannedWork
from app.models.audit_log import AuditLog
from app.services.auth import hash_password


async def seed():
    """Populate database with test data."""
    await init_db()

    async with async_session() as session:
        # ── Users ──
        users = [
            User(username="admin", password_hash=hash_password("admin123"), role="admin", is_active=True),
            User(username="planner", password_hash=hash_password("planner123"), role="planner", is_active=True),
            User(username="viewer", password_hash=hash_password("viewer123"), role="viewer", is_active=True),
        ]
        session.add_all(users)
        await session.flush()

        # ── SLAs ──
        slas = [
            SLA(zabbix_slaid="1", name="ABH HANA", slo=99.9, schedule_type="24x7"),
            SLA(zabbix_slaid="2", name="Core Banking", slo=99.95, schedule_type="24x7"),
            SLA(zabbix_slaid="3", name="Payment Gateway", slo=99.9, schedule_type="24x7"),
            SLA(zabbix_slaid="4", name="CRM System", slo=99.5, schedule_type="custom"),
        ]
        session.add_all(slas)
        await session.flush()

        # ── Services ──
        services = [
            Service(
                zabbix_serviceid="1", name="ABH HANA 1", algorithm="0", sortorder=0, status=0,
                tags=json.dumps([{"tag": "service", "value": "ABH_HANA"}]),
            ),
            Service(
                zabbix_serviceid="2", name="ABH HANA 2", parent_zabbix_serviceid="1",
                algorithm="0", sortorder=1, status=0,
                tags=json.dumps([{"tag": "service", "value": "ABH_HANA"}]),
            ),
            Service(
                zabbix_serviceid="3", name="Core DB Primary", algorithm="0", sortorder=0, status=0,
                tags=json.dumps([{"tag": "service", "value": "CORE_BANKING"}]),
            ),
            Service(
                zabbix_serviceid="4", name="Core DB Replica", parent_zabbix_serviceid="3",
                algorithm="1", sortorder=1, status=0,
                tags=json.dumps([{"tag": "service", "value": "CORE_BANKING"}]),
            ),
            Service(
                zabbix_serviceid="5", name="Payment API", algorithm="0", sortorder=0, status=0,
                tags=json.dumps([{"tag": "service", "value": "PAYMENT_GW"}]),
            ),
            Service(
                zabbix_serviceid="6", name="CRM Frontend", algorithm="0", sortorder=0, status=0,
                tags=json.dumps([{"tag": "service", "value": "CRM"}]),
            ),
            Service(
                zabbix_serviceid="7", name="CRM Backend", parent_zabbix_serviceid="6",
                algorithm="0", sortorder=1, status=0,
                tags=json.dumps([{"tag": "service", "value": "CRM"}]),
            ),
        ]
        session.add_all(services)
        await session.flush()

        # ── SLA-Service Links (через теги) ──
        links = [
            SlaServiceLink(sla_id=slas[0].id, service_id=services[0].id),  # ABH HANA → ABH HANA 1
            SlaServiceLink(sla_id=slas[0].id, service_id=services[1].id),  # ABH HANA → ABH HANA 2
            SlaServiceLink(sla_id=slas[1].id, service_id=services[2].id),  # Core Banking → Core DB Primary
            SlaServiceLink(sla_id=slas[1].id, service_id=services[3].id),  # Core Banking → Core DB Replica
            SlaServiceLink(sla_id=slas[2].id, service_id=services[4].id),  # Payment Gateway → Payment API
            SlaServiceLink(sla_id=slas[3].id, service_id=services[5].id),  # CRM System → CRM Frontend
            SlaServiceLink(sla_id=slas[3].id, service_id=services[6].id),  # CRM System → CRM Backend
        ]
        session.add_all(links)
        await session.flush()

        # ── Planned Works ──
        works = [
            PlannedWork(
                title="Обновление сертификатов ABH HANA",
                description="Плановая замена SSL-сертификатов",
                service_id=services[0].id, sla_id=slas[0].id,
                started_at=datetime(2024, 3, 15, 22, 0, tzinfo=timezone.utc),
                ended_at=datetime(2024, 3, 16, 2, 0, tzinfo=timezone.utc),
                status="done",
                downtime_marker="SLA Planner #1",
                downtime_period_from="1710540000",
                downtime_period_to="1710554400",
                created_by=users[1].id, updated_by=users[1].id,
            ),
            PlannedWork(
                title="ТО Core DB Primary",
                description="Ежеквартальное техническое обслуживание",
                service_id=services[2].id, sla_id=slas[1].id,
                started_at=datetime(2024, 4, 1, 23, 0, tzinfo=timezone.utc),
                ended_at=datetime(2024, 4, 2, 5, 0, tzinfo=timezone.utc),
                status="planned",
                downtime_marker="SLA Planner #2",
                downtime_period_from="1712012400",
                downtime_period_to="1712034000",
                created_by=users[1].id, updated_by=users[1].id,
            ),
            PlannedWork(
                title="Обновление Payment API v2.5",
                description="Мажорное обновление API шлюза",
                service_id=services[4].id, sla_id=slas[2].id,
                started_at=datetime(2024, 4, 10, 22, 0, tzinfo=timezone.utc),
                ended_at=datetime(2024, 4, 11, 4, 0, tzinfo=timezone.utc),
                status="draft",
                downtime_marker="SLA Planner #3",
                downtime_period_from="1712786400",
                downtime_period_to="1712808000",
                created_by=users[0].id, updated_by=users[0].id,
            ),
        ]
        session.add_all(works)
        await session.flush()

        # ── Audit Logs ──
        logs = [
            AuditLog(user_id=users[1].id, action="create", entity_type="planned_work",
                     entity_id=works[0].id, payload=json.dumps({"title": works[0].title}), result="ok"),
            AuditLog(user_id=users[1].id, action="sync", entity_type="planned_work",
                     entity_id=works[0].id, payload=json.dumps({"zabbix_slaid": "1"}), result="ok"),
            AuditLog(user_id=users[1].id, action="create", entity_type="planned_work",
                     entity_id=works[1].id, payload=json.dumps({"title": works[1].title}), result="ok"),
            AuditLog(user_id=users[0].id, action="sync", entity_type="sla",
                     entity_id=0, payload=json.dumps({"count": 4}), result="ok"),
            AuditLog(user_id=users[0].id, action="create", entity_type="planned_work",
                     entity_id=works[2].id, payload=json.dumps({"title": works[2].title}), result="ok"),
        ]
        session.add_all(logs)

        await session.commit()

    print("✅ Seed completed successfully!")
    print("   Users: admin/admin123, planner/planner123, viewer/viewer123")
    print(f"   SLAs: {len(slas)}")
    print(f"   Services: {len(services)}")
    print(f"   Links: {len(links)}")
    print(f"   Planned Works: {len(works)}")
    print(f"   Audit Logs: {len(logs)}")


if __name__ == "__main__":
    asyncio.run(seed())
