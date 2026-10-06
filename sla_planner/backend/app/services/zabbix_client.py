"""
Zabbix JSON-RPC 7.0 Client

Ключевые факты:
- Авторизация: Authorization: Bearer <token> (НЕ auth в теле)
- selectExcludedDowntimes (camelCase)
- excluded_downtimes: массив {name, period_from, period_to} — все СТРОКАМИ, unixtime UTC
- sla.update ПЕРЕЗАПИСЫВАЕТ весь массив excluded_downtimes
- Связь SLA↔Service через теги (service_tags у SLA, tags у Service)
"""

import httpx
import logging
from typing import Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)


class ZabbixClient:
    """Async Zabbix JSON-RPC 7.0 client."""

    def __init__(self):
        self.api_url = settings.ZABBIX_API_URL
        self.token = settings.ZABBIX_API_TOKEN
        self.read_only = settings.ZABBIX_READ_ONLY
        self._request_id = 0

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}",
        }

    async def _call(self, method: str, params: dict | None = None) -> Any:
        """Вызов JSON-RPC метода."""
        if not self.api_url or not self.token:
            raise ValueError("Zabbix API URL и токен не настроены")

        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": self._next_id(),
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self.api_url,
                json=payload,
                headers=self._headers(),
            )
            response.raise_for_status()
            data = response.json()

        if "error" in data:
            error = data["error"]
            msg = f"Zabbix error: {error.get('data', error.get('message', 'Unknown'))}"
            logger.error(msg)
            raise ZabbixError(msg)

        return data.get("result")

    # ── Read methods ──

    async def sla_get(self, select_excluded_downtimes: bool = True) -> list[dict]:
        """Получить все SLA."""
        params: dict[str, Any] = {"output": "extend"}
        if select_excluded_downtimes:
            params["selectExcludedDowntimes"] = "extend"  # camelCase!
        return await self._call("sla.get", params)

    async def service_get(self, select_tags: bool = True) -> list[dict]:
        """Получить дерево услуг."""
        params: dict[str, Any] = {"output": "extend"}
        if select_tags:
            params["selectTags"] = "extend"
        return await self._call("service.get", params)

    # ── Write methods ──

    async def sla_update(self, slaid: str, excluded_downtimes: list[dict]) -> dict:
        """
        Обновить SLA (включая excluded_downtimes).
        
        ВАЖНО: sla.update ПЕРЕЗАПИСЫВАЕТ весь массив excluded_downtimes.
        Нужно передать ВСЕ окна, включая существующие.
        
        excluded_downtimes: [{"name": "...", "period_from": "1234567890", "period_to": "1234567890"}]
        Все значения СТРОКАМИ.
        """
        if self.read_only:
            raise ZabbixError("Read-only mode: sla.update заблокирован")

        return await self._call("sla.update", {
            "slaid": slaid,
            "excluded_downtimes": excluded_downtimes,
        })

    async def add_excluded_downtime(
        self, slaid: str, name: str, period_from: str, period_to: str
    ) -> list[dict]:
        """
        Добавить окно исключённого простоя к SLA.
        
        Логика read-modify-write:
        1. Получить текущие excluded_downtimes через sla.get
        2. Добавить новое окно
        3. Отправить весь массив через sla.update
        """
        if self.read_only:
            raise ZabbixError("Read-only mode: нельзя добавить исключение простоя")

        # 1. Read
        slas = await self.sla_get(select_excluded_downtimes=True)
        sla = next((s for s in slas if s["slaid"] == slaid), None)
        if not sla:
            raise ZabbixError(f"SLA {slaid} не найден")

        existing = sla.get("excluded_downtimes", [])

        # 2. Modify — добавить новое окно
        new_downtimes = existing + [{
            "name": name,
            "period_from": str(period_from),
            "period_to": str(period_to),
        }]

        # 3. Write — отправить ВЕСЬ массив
        await self.sla_update(slaid, new_downtimes)
        return new_downtimes


class ZabbixError(Exception):
    """Ошибка взаимодействия с Zabbix API."""
    pass


# Singleton
zabbix_client = ZabbixClient()
