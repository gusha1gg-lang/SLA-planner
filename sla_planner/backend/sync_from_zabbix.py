#!/usr/bin/env python3
"""
Скрипт для синхронизации данных из Zabbix в SLA Planner.

Использование:
    cd /opt/sla_planner1/sla_planner/backend
    source venv/bin/activate
    export PYTHONPATH=/opt/sla_planner1/sla_planner/backend
    python sync_from_zabbix.py
"""

import asyncio
import sys
from app.database import async_session
from app.services.sync import full_sync


async def main():
    print("🔄 Начинаю синхронизацию с Zabbix...")
    print()
    
    try:
        async with async_session() as session:
            result = await full_sync(session)
            
            print("✅ Синхронизация завершена!")
            print()
            print(f"   SLA: {result['slas']}")
            print(f"   Услуги: {result['services']}")
            print(f"   Связи: {result['links']}")
            print()
            print("🎉 Данные из Zabbix успешно загружены в SLA Planner!")
            
    except Exception as e:
        print(f"❌ Ошибка синхронизации: {e}")
        print()
        print("Проверьте:")
        print("  1. Zabbix API URL в .env")
        print("  2. API токен в .env")
        print("  3. Доступность Zabbix: curl http://localhost:8080/api_jsonrpc.php")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
