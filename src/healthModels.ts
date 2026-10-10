import { Service } from './types';

/**
 * Модель здоровья = дерево услуг от корневого сервиса (услуги без родителя).
 * В Zabbix 7.0 это «Модель здоровья» (service tree).
 */
export interface HealthModel {
  rootId: string;      // zabbix_serviceid корня
  rootName: string;    // имя корня = имя модели
  serviceIds: Set<string>; // zabbix_serviceid всех узлов дерева (корень + потомки)
}

/**
 * Собрать список моделей здоровья из плоского списка услуг.
 * Корни — услуги без родителя; serviceIds — корень и все потомки.
 */
export function buildHealthModels(services: Service[]): HealthModel[] {
  const childrenMap = new Map<string, string[]>();
  for (const s of services) {
    if (!s.parent_zabbix_serviceid) continue;
    const list = childrenMap.get(s.parent_zabbix_serviceid) || [];
    list.push(s.zabbix_serviceid);
    childrenMap.set(s.parent_zabbix_serviceid, list);
  }
  const roots = services.filter(s => !s.parent_zabbix_serviceid);
  const result: HealthModel[] = roots.map(r => {
    const ids = new Set<string>();
    const stack = [r.zabbix_serviceid];
    while (stack.length) {
      const id = stack.pop()!;
      if (ids.has(id)) continue;
      ids.add(id);
      stack.push(...(childrenMap.get(id) || []));
    }
    return { rootId: r.zabbix_serviceid, rootName: r.name, serviceIds: ids };
  });
  return result.sort((a, b) => a.rootName.localeCompare(b.rootName, 'ru'));
}
