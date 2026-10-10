#!/usr/bin/env python3
"""
Готовый клиент Zabbix API 7.0 для тестового стенда (localhost:8080).

Учётные данные: env ZABBIX_API_URL / ZABBIX_API_TOKEN, иначе sla_planner/backend/.env.

Примеры:
    # структура модели (дерево листьев) от корня
    walk_service("796")
    # хосты с тегами/items/триггерами
    hosts_with_tags("MES-")
    # problem_tags на листовой услуге (заменяет список целиком)
    set_problem_tags("809", "MES-COM-PROD")
    # триггер «недоступен по пингу» на хосте
    ensure_ping_trigger(hostname="MES-COM-PROD", ip="192.0.2.1", service="MES-COM-PROD")
"""
import json
import os
import sys
import urllib.request

DOTENV = "/opt/sla_planner1/sla_planner/backend/.env"


def creds():
    url = os.environ.get("ZABBIX_API_URL")
    token = os.environ.get("ZABBIX_API_TOKEN")
    if url and token:
        return url, token
    env = {}
    if os.path.exists(DOTENV):
        for line in open(DOTENV, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    return env["ZABBIX_API_URL"], env["ZABBIX_API_TOKEN"]


def api(method, params):
    """Вызов JSON-RPC метода. Авторизация — только Bearer (поле auth не работает)."""
    url, token = creds()
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json-rpc", "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.load(r)
    if "error" in resp:
        raise RuntimeError(f"{method}: {resp['error']}")
    return resp.get("result")


def walk_service(sid, depth=0):
    """Рекурсивно печатает дерево услуги (нужен selectParents/Children — нет parent_serviceid)."""
    s = api("service.get", {
        "output": ["serviceid", "name", "status"],
        "selectChildren": ["serviceid", "name"],
        "selectProblemTags": ["tag", "value", "operator"],
        "serviceids": [sid],
    })[0]
    print(f"{'  ' * depth}- {s['name']} ({s['serviceid']}) problem_tags={s.get('problem_tags')}")
    for c in (s.get("children") or []):
        walk_service(c["serviceid"], depth + 1)


def hosts_with_tags(search=""):
    """Хосты (по подстроке имени) с тегами/ip/items/триггерами."""
    hosts = api("host.get", {
        "output": ["hostid", "host", "name"],
        "selectTags": ["tag", "value"],
        "selectInterfaces": ["ip"],
        "selectItems": ["itemid", "key_", "name", "status"],
        "selectTriggers": ["triggerid", "description", "expression", "priority", "status"],
        "search": {"host": search} if search else None,
    })
    for h in hosts:
        print(f"\n-- {h['host']} ({h['hostid']}) tags={h.get('tags')} ip={[i['ip'] for i in h.get('interfaces') or []]}")
        for it in h.get("items") or []:
            print(f"   item {it['itemid']} {it['key_']} ({it['name']}) status={it['status']}")
        for t in h.get("triggers") or []:
            print(f"   trig {t['triggerid']} «{t['description']}» prio={t['priority']} expr={t['expression']}")


def set_problem_tags(serviceid, value, tag="service"):
    """problem_tags на ЛИСТОВОЙ услуге (услугам с детьми нельзя). Заменяет список целиком."""
    api("service.update", {"serviceid": serviceid, "problem_tags": [{"tag": tag, "value": value, "operator": "0"}]})
    print(f"problem_tags {tag}={value} -> услуга {serviceid}")


def ensure_ping_trigger(hostname, ip, service):
    """Триггер «недоступен по пингу» с тегом service (ключ item — ТОЧНО icmpping[<ip>])."""
    host = api("host.get", {"filter": {"host": [hostname]}, "output": ["hostid"]})[0]["hostid"]
    expr = f"last(/{hostname}/icmpping[{ip}])=0"
    trigs = api("trigger.get", {"hostids": [host], "output": ["triggerid", "description"]})
    existing = next((t for t in trigs if t["description"] == "недоступен по пингу"), None)
    if existing:
        api("trigger.update", {"triggerid": existing["triggerid"], "expression": expr,
                               "priority": 4, "tags": [{"tag": "service", "value": service}]})
        print(f"триггер обновлён: {existing['triggerid']} {expr}")
    else:
        tid = api("trigger.create", {"description": "недоступен по пингу", "expression": expr,
                                     "priority": 4, "status": 0,
                                     "tags": [{"tag": "service", "value": service}]})["triggerids"][0]
        print(f"триггер создан: {tid} {expr}")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "tree":
        walk_service(sys.argv[2] if len(sys.argv) > 2 else "796")
    elif len(sys.argv) > 1 and sys.argv[1] == "hosts":
        hosts_with_tags(sys.argv[2] if len(sys.argv) > 2 else "")
    else:
        print(__doc__)