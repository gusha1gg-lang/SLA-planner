"""
Zabbix JSON-RPC 7.0 Client

Ключевые факты:
- Авторизация: Authorization: Bearer <token> (НЕ auth в теле)
- selectExcludedDowntimes (camelCase)
- excluded_downtimes: массив {name, period_from, period_to} — все СТРОКАМИ, unixtime UTC
- sla.update ПЕРЕЗАПИСЫВАЕТ весь массив excluded_downtimes
- Связь SLA↔Service через теги (service_tags у SLA, tags у Service)
"""

import asyncio
import httpx
import logging
from typing import Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)


class ZabbixError(Exception):
    """Ошибка взаимодействия с Zabbix API."""
    pass


class ZabbixClient:
    """Async Zabbix JSON-RPC 7.0 client с retry."""

    def __init__(self):
        self.api_url = settings.ZABBIX_API_URL
        self.token = settings.ZABBIX_API_TOKEN
        self.read_only = settings.ZABBIX_READ_ONLY
        self._request_id = 0
        self._client: Optional[httpx.AsyncClient] = None

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}",
        }

    async def _get_client(self) -> httpx.AsyncClient:
        """Получить или создать HTTP-клиент."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(30.0, connect=10.0),
                limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            )
        return self._client

    async def close(self):
        """Закрыть HTTP-клиент."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def _call(self, method: str, params: dict | None = None, retries: int = 3) -> Any:
        """
        Вызов JSON-RPC метода с retry.
        
        Retry логика:
        - 3 попытки по умолчанию
        - Exponential backoff: 1s, 2s, 4s
        - Retry только на сетевые ошибки и 5xx
        """
        if not self.api_url or not self.token:
            raise ZabbixError("Zabbix API URL и токен не настроены. Проверьте .env")

        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": self._next_id(),
        }

        last_error = None
        for attempt in range(retries):
            try:
                client = await self._get_client()
                response = await client.post(
                    self.api_url,
                    json=payload,
                    headers=self._headers(),
                )

                # Retry на 5xx
                if response.status_code >= 500:
                    raise httpx.HTTPStatusError(
                        f"Server error: {response.status_code}",
                        request=response.request,
                        response=response,
                    )

                response.raise_for_status()
                data = response.json()

                if "error" in data:
                    error = data["error"]
                    msg = f"Zabbix error [{method}]: {error.get('data', error.get('message', 'Unknown'))}"
                    logger.error(msg)
                    raise ZabbixError(msg)

                return data.get("result")

            except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as e:
                last_error = e
                if attempt < retries - 1:
                    wait_time = 2 ** attempt  # 1s, 2s, 4s
                    logger.warning(
                        f"Zabbix API error (attempt {attempt + 1}/{retries}): {e}. "
                        f"Retrying in {wait_time}s..."
                    )
                    await asyncio.sleep(wait_time)
                    # Пересоздать клиент при сетевых ошибках
                    await self.close()
                else:
                    logger.error(f"Zabbix API failed after {retries} attempts: {e}")

            except ZabbixError:
                # Бизнес-ошибки Zabbix не ретраим
                raise

            except Exception as e:
                logger.error(f"Unexpected error calling Zabbix {method}: {e}")
                raise ZabbixError(f"Unexpected error: {e}")

        raise ZabbixError(f"Zabbix API call failed after {retries} retries: {last_error}")

    # ── Read methods ──

    async def sla_get(self, select_excluded_downtimes: bool = True) -> list[dict]:
        """Получить все SLA."""
        params: dict[str, Any] = {"output": "extend"}
        if select_excluded_downtimes:
            params["selectExcludedDowntimes"] = "extend"  # camelCase!
        return await self._call("sla.get", params)

    async def sla_get_by_id(self, slaid: str) -> dict:
        """Получить конкретный SLA по ID."""
        result = await self.sla_get(select_excluded_downtimes=True)
        sla = next((s for s in result if s["slaid"] == slaid), None)
        if not sla:
            raise ZabbixError(f"SLA {slaid} не найден")
        return sla

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
        sla = await self.sla_get_by_id(slaid)
        existing = sla.get("excluded_downtimes", [])

        # 2. Modify — добавить новое окно
        new_downtimes = existing + [{
            "name": name,
            "period_from": str(period_from),
            "period_to": str(period_to),
        }]

        # 3. Write — отправить ВЕСЬ массив
        await self.sla_update(slaid, new_downtimes)
        logger.info(f"Added excluded downtime '{name}' to SLA {slaid}")
        return new_downtimes

    async def remove_excluded_downtime(
        self, slaid: str, downtime_name: str
    ) -> list[dict]:
        """
        Удалить окно исключённого простоя из SLA по имени.
        
        Логика read-modify-write:
        1. Получить текущие excluded_downtimes
        2. Отфильтровать по имени
        3. Отправить обновлённый массив
        """
        if self.read_only:
            raise ZabbixError("Read-only mode: нельзя удалить исключение простоя")

        sla = await self.sla_get_by_id(slaid)
        existing = sla.get("excluded_downtimes", [])

        # Фильтруем — оставляем всё, кроме удаляемого
        new_downtimes = [d for d in existing if d.get("name") != downtime_name]

        if len(new_downtimes) == len(existing):
            logger.warning(f"Downtime '{downtime_name}' not found in SLA {slaid}")
            return existing

        await self.sla_update(slaid, new_downtimes)
        logger.info(f"Removed excluded downtime '{downtime_name}' from SLA {slaid}")
        return new_downtimes

    # ── Health check ──

    async def ping(self) -> bool:
        """Проверить доступность Zabbix API."""
        try:
            # Простой read-запрос
            await self._call("sla.get", {"output": ["slaid"], "limit": 1})
            return True
        except Exception as e:
            logger.error(f"Zabbix ping failed: {e}")
            return False


# Singleton
zabbix_client = ZabbixClient()
