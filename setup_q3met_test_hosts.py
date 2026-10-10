#!/usr/bin/env python3
"""
Приведение тестовых хостов модели «Q3MET ТЭСЦ-1» к реальным именам и правильная привязка.

Соответствие «хост ↔ ветка модели (корень 796)»:
    MES-COM-PROD       ← переименовывается q3met-app-01, лист 809 «Доступность по ping»
    MDB                ← переименовывается q3met-app-02, лист 778 «Доступность по ping»
    MES-DB-PROD-TESC1  ← создаётся заново, лист 798 «Доступность по ping»

Как устроена привязка (важно для Zabbix 7.0):
- у хоста и триггера «недоступен по пингу» стоит тег `service: <имя>`;
- на ЛИСТОВОЙ услуге «Доступность по ping» соответствующей ветки заданы `problem_tags`
  `service: <имя>` — по ним проблема хоста попадает в услугу. Услуги с детьми
  `problem_tags` иметь не могут, поэтому тег вешается на лист, а не на ветку/корень.
- IP остаются из TEST-NET 192.0.2.0/24 (RFC 5737): пинг всегда не идёт → триггер
  срабатывает и модель показывает проблему (при необходимости «поднять» услуги —
  достаточно переключить IP хостов на реальные).

Скрипт идемпотентный: если хост/триггер уже есть нужного имени — не дублирует,
а лишь доводит теги/выражение до нужного состояния. Учётные данные — из env
ZABBIX_API_URL / ZABBIX_API_TOKEN или из sla_planner/backend/.env.

Запуск (из корня репозитория):
    python3 setup_q3met_test_hosts.py
"""
import json
import os
import sys
import urllib.request

GROUP = "Applications"

# имя хоста -> параметры (старое имя переименовываемого хоста, IP-октет, лист «Доступность по ping»)
SPECS = [
    {"old": "q3met-app-01", "host": "MES-COM-PROD", "ip_octet": 1, "leaf": "809"},
    {"old": "q3met-app-02", "host": "MDB", "ip_octet": 2, "leaf": "778"},
    {"old": None, "host": "MES-DB-PROD-TESC1", "ip_octet": 3, "leaf": "798"},
]


def load_credentials():
    url = os.environ.get("ZABBIX_API_URL")
    token = os.environ.get("ZABBIX_API_TOKEN")
    if url and token:
        return url, token
    dotenv = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sla_planner", "backend", ".env")
    if not os.path.exists(dotenv):
        sys.exit("Не найден backend/.env и не заданы ZABBIX_API_URL/ZABBIX_API_TOKEN")
    env = {}
    for line in open(dotenv, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    return env["ZABBIX_API_URL"], env["ZABBIX_API_TOKEN"]


def api(url, token, method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode("utf-8")
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json-rpc", "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.load(r)
    if "error" in resp:
        raise RuntimeError(f"{method}: {resp['error']}")
    return resp.get("result")


def get_host(url, token, name):
    res = api(url, token, "host.get", {"filter": {"host": [name]}, "output": ["hostid", "host", "name"]})
    return res[0] if res else None


def ensure_host(url, token, groups, spec):
    """Возвращает hostid хоста spec['host'], переименовывая старый или создавая новый."""
    hostname, old = spec["host"], spec["old"]
    if old:
        old_host = get_host(url, token, old)
        if old_host and not get_host(url, token, hostname):
            api(url, token, "host.update", {
                "hostid": old_host["hostid"],
                "host": hostname,
                "name": hostname,
                "tags": [{"tag": "service", "value": hostname}],
            })
            print(f"== переименован: {old} -> {hostname} ({old_host['hostid']})")
            return old_host["hostid"]

    exists = get_host(url, token, hostname)
    if exists:
        api(url, token, "host.update", {
            "hostid": exists["hostid"],
            "tags": [{"tag": "service", "value": hostname}],
        })
        print(f"== уже есть: {hostname} ({exists['hostid']}), тег service={hostname} выставлен")
        return exists["hostid"]

    hostid = api(url, token, "host.create", {
        "host": hostname,
        "name": hostname,
        "groups": [{"groupid": groups[GROUP]}],
        "tags": [{"tag": "service", "value": hostname}],
        "interfaces": [{"type": 1, "main": 1, "useip": 1, "ip": f"192.0.2.{spec['ip_octet']}", "dns": "", "port": "10050"}],
    })["hostids"][0]
    print(f"== создан: {hostname} ({hostid}) ip=192.0.2.{spec['ip_octet']}")
    return hostid


def ensure_item(url, token, hostid, hostname, spec):
    """Гарантирует item icmpping[192.0.2.X] на хосте."""
    ip = f"192.0.2.{spec['ip_octet']}"
    key = f"icmpping[{ip}]"
    items = api(url, token, "item.get", {
        "hostids": [hostid], "filter": {"key_": [key]}, "output": ["itemid", "key_"],
    })
    if items:
        print(f"  item уже есть: {key} ({items[0]['itemid']})")
        return items[0]["itemid"]
    itemid = api(url, token, "item.create", {
        "hostid": hostid, "name": "ICMP ping", "key_": key,
        "type": 3, "delay": "1m", "value_type": 3, "history": "31d", "trends": "365d",
    })["itemids"][0]
    print(f"  item создан: {key} ({itemid})")
    return itemid


def ensure_trigger(url, token, hostid, hostname, spec):
    """Гарантирует триггер «недоступен по пингу» с тегом service и правильным хостом в выражении."""
    ip = f"192.0.2.{spec['ip_octet']}"
    expr = f"last(/{hostname}/icmpping[{ip}])=0"
    trigs = api(url, token, "trigger.get", {"hostids": [hostid], "output": ["triggerid", "description"]})
    trig = next((t for t in trigs if t["description"] == "недоступен по пингу"), None)
    if trig:
        api(url, token, "trigger.update", {
            "triggerid": trig["triggerid"],
            "expression": expr,
            "description": "недоступен по пингу",
            "priority": 4,
            "tags": [{"tag": "service", "value": hostname}],
        })
        print(f"  триггер обновлён: {trig['triggerid']} expr={expr} тег service={hostname}")
        return trig["triggerid"]
    trigid = api(url, token, "trigger.create", {
        "description": "недоступен по пингу",
        "expression": expr,
        "priority": 4,
        "status": 0,
        "tags": [{"tag": "service", "value": hostname}],
    })["triggerids"][0]
    print(f"  триггер создан: {trigid} expr={expr} тег service={hostname}")
    return trigid


def ensure_problem_tags(url, token, leaf, service):
    """Вешает problem_tags service: <имя> на листовую услугу «Доступность по ping»."""
    api(url, token, "service.update", {
        "serviceid": leaf,
        "problem_tags": [{"tag": "service", "value": service, "operator": "0"}],
    })
    print(f"== problem_tags на услуге {leaf}: service={service}")


def main():
    url, token = load_credentials()
    groups = {g["name"]: g["groupid"] for g in api(url, token, "hostgroup.get", {"output": ["groupid", "name"]})}
    if GROUP not in groups:
        sys.exit(f"Группа '{GROUP}' не найдена. Доступны: {', '.join(groups)}")

    for spec in SPECS:
        name = spec["host"]
        print(f"\n-- хост {name} (лист «Доступность по ping»: {spec['leaf']})")
        hostid = ensure_host(url, token, groups, spec)
        ensure_item(url, token, hostid, name, spec)
        ensure_trigger(url, token, hostid, name, spec)
        ensure_problem_tags(url, token, spec["leaf"], name)

    print("\nИтог: хосты MES-COM-PROD / MDB / MES-DB-PROD-TESC1 привязаны к веткам модели Q3MET ТЭСЦ-1.")


if __name__ == "__main__":
    main()