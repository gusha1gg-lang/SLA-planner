#!/usr/bin/env python3
"""
Создание тестовых хостов с триггером «недоступен по пингу» для тестового Zabbix 7.0.

Что делает (и почему так):
- создаёт <count> хостов <prefix>-NN с тегом `service: <SERVICE>` и агент-интерфейсом
  на заведомо недоступных TEST-NET IP (192.0.2.x, RFC 5737) — пинг не пойдёт всегда;
- на каждом хосте item `icmpping[<ip>]` (delay 1m) — цель задаётся В КЛЮЧЕ, иначе item
  падает в unsupported («must have target or host interface specified»);
- триггер «недоступен по пингу» (severity 4) **с тегом `service: <SERVICE>`** — тег обязателен:
  по нему проблема связывается с услугой через её `problem_tags`;
- скрипт идемпотентный: если хост уже есть — пропускает.

ПРИМЕЧАНИЕ по услугам в Zabbix 7.0: услуга, у которой есть дочерние услуги, НЕ может иметь
`problem_tags` («cannot have problem tags and children at the same time»). Поэтому `problem_tags`
надо вешать на ЛИСТОВУЮ услугу дерева (например «Доступность по ping»), а не на корень модели.
Этот шаг делается вручную (или отдельным скриптом) и здесь не автоматизирован.

Учётные данные: берутся из переменных окружения ZABBIX_API_URL / ZABBIX_API_TOKEN,
при их отсутствии — из sla_planner/backend/.env.

Пример:
    python3 create_ping_test_hosts.py --service "Q3MET ТЭСЦ-1" --prefix q3met-app --count 2
"""
import argparse
import json
import os
import sys
import urllib.request


def load_credentials():
    """URL/токен из env или из backend/.env (стандарт проекта)."""
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


def testnet_ip(base_int, i):
    """IP из TEST-NET 192.0.2.0/24 (RFC 5737): гарантированно не пингуется извне."""
    # base_int — стартовый последний октет (обычно 1)
    return f"192.0.2.{base_int + i}"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--service", required=True, help="Значение тега service (например 'Q3MET ТЭСЦ-1')")
    parser.add_argument("--prefix", required=True, help="Префикс имён хостов (например q3met-app)")
    parser.add_argument("--count", type=int, default=2, help="Сколько хостов создать (по умолчанию 2)")
    parser.add_argument("--group", default="Applications", help="Группа хостов (по умолчанию Applications)")
    parser.add_argument("--base-ip-octet", type=int, default=1, help="Начальный последний октет TEST-NET IP (по умолчанию 1)")
    args = parser.parse_args()

    url, token = load_credentials()
    groups = {g["name"]: g["groupid"] for g in api(url, token, "hostgroup.get", {"output": ["groupid", "name"]})}
    if args.group not in groups:
        sys.exit(f"Группа '{args.group}' не найдена. Доступны: {', '.join(groups)}")

    created, skipped = [], []
    for i in range(1, args.count + 1):
        hostname = f"{args.prefix}-{i:02d}"
        ip = testnet_ip(args.base_ip_octet, i - 1)

        exists = api(url, token, "host.get", {"filter": {"host": [hostname]}, "output": ["hostid"]})
        if exists:
            skipped.append((hostname, exists[0]["hostid"]))
            print(f"== пропуск (уже есть): {hostname} -> {exists[0]['hostid']}")
            continue

        hostid = api(url, token, "host.create", {
            "host": hostname,
            "groups": [{"groupid": groups[args.group]}],
            "tags": [{"tag": "service", "value": args.service}],
            "interfaces": [{"type": 1, "main": 1, "useip": 1, "ip": ip, "dns": "", "port": "10050"}],
        })["hostids"][0]

        itemid = api(url, token, "item.create", {
            "hostid": hostid, "name": "ICMP ping", "key_": f"icmpping[{ip}]",
            "type": 3, "delay": "1m", "value_type": 3, "history": "31d", "trends": "365d",
        })["itemids"][0]

        trigid = api(url, token, "trigger.create", {
            "description": "недоступен по пингу",
            "expression": f"last(/{hostname}/icmpping[{ip}])=0",  # ключ item с параметром!
            "priority": 4,
            "status": 0,
            "tags": [{"tag": "service", "value": args.service}],  # тег на триггере обязателен
        })["triggerids"][0]

        created.append((hostname, hostid, itemid, trigid, ip))
        print(f"== создан: {hostname} host={hostid} item={itemid} trigger={trigid} ip={ip} (тег service={args.service})")

    print("\nИтог:")
    print(f"  создано: {len(created)}, пропущено: {len(skipped)}")
    if skipped:
        print("  уже существующие хосты:", ", ".join(h for h, _ in skipped))


if __name__ == "__main__":
    main()