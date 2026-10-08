#!/usr/bin/env python3
"""
Импорт SLA и Services из zabbix_dump.json в тестовый Zabbix 7.0.
Создаёт услуги (корневые -> дочерние), потом SLA.
"""
import json
import sys
import urllib.request
import ssl

ZBX_URL = "http://localhost:8080/api_jsonrpc.php"
USER = "Admin"
PASS = "zabbix"
INPUT_FILE = "/opt/sla_planner1/zabbix_dump.json"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def api(method, params, token=None):
    payload = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        ZBX_URL, data=json.dumps(payload).encode("utf-8"),
        headers=headers, method="POST",
    )
    with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    if "error" in data:
        return None, data["error"]
    return data["result"], None

def main():
    with open(INPUT_FILE, encoding="utf-8") as f:
        dump = json.load(f)

    slas = dump["slas"]
    services = dump["services"]
    print(f"Загружено: SLA={len(slas)}, Services={len(services)}")

    # Логин
    token, err = api("user.login", {"username": USER, "password": PASS})
    if err:
        print("ОШИБКА логина:", err); sys.exit(1)
    print(f"Логин ок, токен: {token[:10]}...")

    # Шаг 1: создаём все услуги (плоско, без parentid)
    # В Zabbix 7.0 связь parent<->child строится через service.create 
    # с полем parentid. Но parentid в дампе нет — только children/parents.
    # Поэтому создаём все без parent, потом обновляем через service.update.
    id_map = {}  # old_serviceid -> new_serviceid

    print("\n=== Создание услуг ===")
    for i, (old_id, svc) in enumerate(services.items(), 1):
        params = {
            "name": svc["name"],
            "algorithm": int(svc.get("algorithm", 1)),
            "sortorder": int(svc.get("sortorder", 0)),
            "uuid": svc["uuid"],
        }
        if svc.get("tags"):
            params["tags"] = [{"tag": t["tag"], "value": t["value"]} for t in svc["tags"]]
        if svc.get("description"):
            params["description"] = svc["description"]

        result, err = api("service.create", params, token)
        if err:
            print(f"  [{i}/{len(services)}] ОШИБКА {svc['name']}: {err.get('data', err)}")
            continue
        new_id = result["serviceids"][0]
        id_map[old_id] = new_id
        if i % 50 == 0:
            print(f"  [{i}/{len(services)}] создано...")

    print(f"Создано услуг: {len(id_map)} из {len(services)}")

    # Шаг 2: обновляем parentid (теперь, когда все услуги есть)
    print(f"Parentid установлено: {updated}")
    updated = 0
    for old_id, svc in services.items():
        parents = svc.get("parents") or []
        if not parents:
            continue
        new_id = id_map.get(old_id)
        old_parent_id = parents[0]["serviceid"]
        new_parent_id = id_map.get(old_parent_id)
        if not new_id or not new_parent_id:
            continue
        result, err = api("service.update", {
            "serviceid": new_id,
            "parentid": new_parent_id,
        }, token)
        if err:
            print(f"  ОШИБКА parent для {svc['name']}: {err.get('data', err)}")
            continue
        updated += 1
        if updated % 50 == 0:
            print(f"  обновлено... {updated}")

    print(f"Parentid установлено: {updated}")

    # Шаг 3: создаём SLA
    print("\n=== Создание SLA ===")
    created_slas = 0
    for i, (old_id, sla) in enumerate(slas.items(), 1):
        params = {
            "name": sla["name"],
            "slo": sla["slo"],
            "period": sla["period"],
            "timezone": sla["timezone"],
            "effective_date": sla["effective_date"],
            "status": int(sla.get("status", 1)),
        }
        if sla.get("description"):
            params["description"] = sla["description"]
        if sla.get("service_tags"):
            params["service_tags"] = [
                {
                    "tag": t["tag"],
                    "operator": int(t.get("operator", 0)),
                    "value": t["value"],
                }
                for t in sla["service_tags"]
            ]
        if sla.get("excluded_downtimes"):
            params["excluded_downtimes"] = [
                {
                    "name": d["name"],
                    "period_from": d["period_from"],
                    "period_to": d["period_to"],
                }
                for d in sla["excluded_downtimes"]
            ]

        result, err = api("sla.create", params, token)
        if err:
            print(f"  [{i}/{len(slas)}] ОШИБКА {sla['name']}: {err.get('data', err)}")
            continue
        created_slas += 1
        print(f"  [{i}/{len(slas)}] SLA создан: {sla['name']}")

    print(f"\nСоздано SLA: {created_slas} из {len(slas)}")
    print("\n=== ГОТОВО ===")

if __name__ == "__main__":
    main()
