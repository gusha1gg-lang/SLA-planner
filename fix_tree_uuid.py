#!/usr/bin/env python3
"""Установка дерева услуг через UUID."""
import json, sys, urllib.request, ssl

ZBX_URL = "http://localhost:8080/api_jsonrpc.php"
USER, PASS = "Admin", "zabbix"
INPUT_FILE = "/opt/sla_planner1/zabbix_dump.json"

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

def main():
    with open(INPUT_FILE, encoding="utf-8") as f:
        dump = json.load(f)
    services = dump["services"]
    print(f"В дампе услуг: {len(services)}")

    token = api("user.login", {"username": USER, "password": PASS})["result"]

    existing = api("service.get", {"output": ["serviceid", "uuid"], "preservekeys": True}, token)["result"]
    uuid_to_new_id = {s["uuid"]: s["serviceid"] for s in existing.values() if s.get("uuid")}
    print(f"В Zabbix услуг с UUID: {len(uuid_to_new_id)}")

    updated = errors = skipped = 0
    for svc in services.values():
        parents = svc.get("parents") or []
        if not parents:
            continue
        child_uuid = svc.get("uuid")
        parent_uuid = parents[0].get("uuid")
        new_child = uuid_to_new_id.get(child_uuid)
        new_parent = uuid_to_new_id.get(parent_uuid)
        if not new_child or not new_parent:
            skipped += 1
            continue
        r = api("service.update", {"serviceid": new_child, "parents": [{"serviceid": new_parent}]}, token)
        if "error" in r:
            errors += 1
        else:
            updated += 1
    print(f"\nОбновлено: {updated}, пропущено: {skipped}, ошибок: {errors}")

if __name__ == "__main__":
    main()
