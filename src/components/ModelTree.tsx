import React, { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Service } from '../types';
import { statusColor, statusLabel } from './ServiceConfigCard';

/**
 * Дерево структуры модели здоровья (услуги Zabbix) — панель справа от графа
 * на «Модели здоровья». Узлы сворачиваются, линии-связи, цветные точки
 * статусов, клик по узлу выбирает услугу (подсветка на графе + детали под графом).
 */
interface ModelTreeProps {
  rootId: string;
  services: Service[];
  selectedServiceId: string;
  onSelect: (zabbixServiceId: string) => void;
}

export default function ModelTree({ rootId, services, selectedServiceId, onSelect }: ModelTreeProps) {
  // zabbix_serviceid свернутых узлов
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const childrenMap = useMemo(() => {
    const m = new Map<string, Service[]>();
    for (const s of services) {
      if (!s.parent_zabbix_serviceid) continue;
      const list = m.get(s.parent_zabbix_serviceid) || [];
      list.push(s);
      m.set(s.parent_zabbix_serviceid, list);
    }
    // детей сортируем по имени (как в Zabbix-списках)
    for (const list of m.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
    return m;
  }, [services]);

  const toggle = (zid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(zid)) next.delete(zid);
      else next.add(zid);
      return next;
    });
  };

  const renderNode = (svc: Service, depth: number) => {
    const kids = childrenMap.get(svc.zabbix_serviceid) || [];
    const isCollapsed = collapsed.has(svc.zabbix_serviceid);
    const isSelected = svc.zabbix_serviceid === selectedServiceId;
    const isRoot = svc.zabbix_serviceid === rootId;

    return (
      <div key={svc.zabbix_serviceid}>
        <button
          onClick={() => onSelect(svc.zabbix_serviceid)}
          title={`${svc.name} (id=${svc.zabbix_serviceid})`}
          className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-left text-sm transition ${
            isSelected ? 'bg-accent-soft ring-1 ring-accent-line' : 'hover:bg-surface-2'
          }`}
        >
          {kids.length > 0 ? (
            <button
              onClick={e => toggle(svc.zabbix_serviceid, e)}
              className="w-4 flex-none text-faint hover:text-muted transition-colors"
              title={isCollapsed ? 'Развернуть' : 'Свернуть'}
            >
              <ChevronRight className={`text-[10px] transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
            </button>
          ) : (
            <span className="w-4 flex-none"></span>
          )}
          <span
            className="w-2.5 h-2.5 rounded-full flex-none"
            style={{ background: statusColor(svc.status) }}
            title={`Статус: ${statusLabel(svc.status)}`}
          />
          <span className={`truncate ${isRoot ? 'font-semibold text-tag-fg' : 'text-content'}`}>
            {svc.name}
          </span>
        </button>
        {!isCollapsed && kids.length > 0 && (
          <div className="ml-[14px] pl-2 border-l border-line">
            {kids.map(kid => renderNode(kid, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const root = services.find(s => s.zabbix_serviceid === rootId);
  if (!root) return null;

  return <div className="space-y-0.5">{renderNode(root, 0)}</div>;
}