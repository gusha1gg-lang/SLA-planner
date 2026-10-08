#!/usr/bin/env python3
"""Удаляет ВСЕ услуги из тестового Zabbix."""
import json
import sys
import urllib.request
import ssl

ZBX_URL = "http://localhost:8080/api_jsonrpc.php"
USER = "Admin"
PASS = "zabbix"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def api(method, params, token=None):
    payload = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(ZBX_URL, data=json.dumps(payload).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
        return json.loads(r.read().decode())

token = api("user.login", {"username": USER, "password": PASS})["result"]
services = api("service.get", {"output": ["serviceid"]}, token)["result"]
ids = [s["serviceid"] for s in services]
print(f"Услуг к удалению: {len(ids)}")

# Удаляем партиями (Zabbix ограничивает)
for i in range(0, len(ids), 100):
    batch = ids[i:i+100]
    r = api("service.delete", batch, token)
    if "error" in r:
        print(f"  ОШИБКА: {r['error']}")
        break
    print(f"  удалено {i+len(batch)}/{len(ids)}")

print("Готово")
