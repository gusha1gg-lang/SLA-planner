---
name: Zabbix API (7.0)
description: Работа с API тестового Zabbix 7.0 — услуги, sla, хосты, триггеры, problem_tags, тег service; готовый клиент и факты API. Использовать при синхронизации, скриптах переноса, привязке хостов к услугам.
---

# Zabbix 7.0 API (тестовый стенд localhost:8080)

Готовый клиент: `python3 scripts/zabbix_client.py` (примеры внутри). Учётные данные —
из env `ZABBIX_API_URL`/`ZABBIX_API_TOKEN` или из `sla_planner/backend/.env` (в git не лежит).
Режим записи: `ZABBIX_READ_ONLY=false` — стенд тестовый, объекты менять можно.

## Проверенные факты 7.0.31 (см. также CONTEXT.md §5 №11, 16, 17)

- **Авторизация**: только `Authorization: Bearer <token>` (поле `auth` в теле не работает).
  `apiinfo.version` с токеном вызывать нельзя.
- **`service.get` НЕ отдаёт `parent_serviceid`** — бери `parents[0]["serviceid"]` (запрос с
  `selectParents`). `selectAncestors`/`problem_count` не поддерживаются; `selectRules`
  («дополнительные правила») — Invalid parameter, НЕ принимать.
- **`service.update`** принимает `parents: [{"serviceid": ...}]` (массив объектов);
  **`service.update problem_tags` перезаписывает список целиком** (как и `sla.update
  excluded_downtimes` — всегда read-modify-write).
- **`problem_tags` нельзя услуге с детьми** («cannot have problem tags and children»).
  Тег проблем вешать ТОЛЬКО на листовую услугу (пример: листья «Доступность по ping»
  809/778/798 модели Q3MET ТЭСЦ-1). operator: 0=Равно…3=Содержит.
- **Item `icmpping` без параметра → unsupported**: ключ `icmpping[<ip>]`, и в выражении триггера
  ключ указывать ТОЧНО как у item: `last(/host/icmpping[<ip>])=0` (иначе «Incorrect item key»).
- **Привязка хоста к услуге** — через теги: на хосте и триггере `tags: [{"tag":"service",
  "value":"<имя>"}]`, на листовой услуге `problem_tags service: <имя>`. Проблема хоста
  попадает в услугу по совпадению тегов. Готовый пример — `setup_q3met_test_hosts.py` (корень репо).
- **Переименование хоста**: `host.update {host, name, tags}`; выражение триггера при этом может
  остаться на старых function-id — надёжнее обновить триггер явно (`trigger.update expression`).
  Теги триггера Zabbix сразу подхватывает в открытые проблемы.
- **`sla`**: `period_from`/`period_to` — строки unixtime UTC; `sla.update` перезаписывает
  `excluded_downtimes` целиком (read-modify-write).

## Как использовать

1. Прочитать `scripts/zabbix_client.py` — функции `creds()` и `api()`, примеры вызовов.
2. Для разовых проверок — `python3 scripts/zabbix_client.py` или свой скрипт на его основе.
3. Для идемпотентных операций с хостами/услугами модели — расширять `setup_q3met_test_hosts.py`.