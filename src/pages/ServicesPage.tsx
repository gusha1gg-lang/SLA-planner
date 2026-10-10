import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { Service } from '../types';
import ServiceConfigCard, { statusColor, statusLabel } from '../components/ServiceConfigCard';

/**
 * Страница «Услуги»: ИТ-специалисты видят, как настроена каждая услуга/модель
 * здоровья в Zabbix (родители, дети, теги проблем, алгоритм, распространение,
 * вес и т.п.) — только живые данные из Zabbix (GET /api/services/{id}/config).
 */

// Модель здоровья = дерево услуг от корня (услуга без родителя).
interface HealthModel {
  rootId: string;
  rootName: string;
  count: number;
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedModelId, setSelectedModelId] = useState(''); // корень модели
  const [search, setSearch] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getServices()
      .then(s => { if (!cancelled) setServices(s); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Карты для быстрых переходов по дереву
  const svcById = useMemo(() => new Map(services.map(s => [s.zabbix_serviceid, s])), [services]);

  const parentOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of services) {
      if (s.parent_zabbix_serviceid) m.set(s.zabbix_serviceid, s.parent_zabbix_serviceid);
    }
    return m;
  }, [services]);

  /** Для каждой услуги — zabbix_serviceid корня модели (с защитой от циклов). */
  const rootOfService = useMemo(() => {
    const root = new Map<string, string>();
    for (const s of services) {
      let cur = s.zabbix_serviceid;
      const seen = new Set<string>();
      while (parentOf.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        cur = parentOf.get(cur)!;
      }
      root.set(s.zabbix_serviceid, seen.has(cur) ? s.zabbix_serviceid : cur);
    }
    return root;
  }, [parentOf, services]);

  // Список моделей здоровья (корни + кол-во услуг), как на «Модель здоровья»
  const models = useMemo<HealthModel[]>(() => {
    const childrenMap = new Map<string, string[]>();
    for (const s of services) {
      if (!s.parent_zabbix_serviceid) continue;
      const list = childrenMap.get(s.parent_zabbix_serviceid) || [];
      list.push(s.zabbix_serviceid);
      childrenMap.set(s.parent_zabbix_serviceid, list);
    }
    return services
      .filter(s => !s.parent_zabbix_serviceid)
      .map(r => {
        const ids = new Set<string>([r.zabbix_serviceid]);
        const stack = [r.zabbix_serviceid];
        while (stack.length) {
          const id = stack.pop()!;
          for (const c of childrenMap.get(id) || []) {
            if (ids.has(c)) continue;
            ids.add(c);
            stack.push(c);
          }
        }
        return { rootId: r.zabbix_serviceid, rootName: r.name, count: ids.size };
      })
      .sort((a, b) => a.rootName.localeCompare(b.rootName, 'ru'));
  }, [services]);

  // Дерево выбранной модели: список {услуга, глубина}, сортировка по имени внутри уровня
  const subtree = useMemo(() => {
    if (!selectedModelId) return [];
    const childrenMap = new Map<string, string[]>();
    for (const s of services) {
      if (!s.parent_zabbix_serviceid) continue;
      const list = childrenMap.get(s.parent_zabbix_serviceid) || [];
      list.push(s.zabbix_serviceid);
      childrenMap.set(s.parent_zabbix_serviceid, list);
    }
    const out: { service: Service; depth: number }[] = [];
    const walk = (id: string, depth: number) => {
      const svc = svcById.get(id);
      if (!svc) return;
      out.push({ service: svc, depth });
      const kids = (childrenMap.get(id) || []).slice()
        .sort((a, b) => (svcById.get(a)?.name || '').localeCompare(svcById.get(b)?.name || '', 'ru'));
      for (const c of kids) walk(c, depth + 1);
    };
    walk(selectedModelId, 1);
    return out;
  }, [selectedModelId, services, svcById]);

  // Список для левой панели: поиск по всем услугам или дерево выбранной модели
  const query = search.trim().toLowerCase();
  const shownList = query
    ? services
        .filter(s => s.name.toLowerCase().includes(query))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map(s => ({ service: s, depth: 0 }))
    : subtree;

  // По умолчанию — первая модель, и открываем её корень
  useEffect(() => {
    if (!selectedModelId && models.length > 0) setSelectedModelId(models[0].rootId);
  }, [models, selectedModelId]);

  useEffect(() => {
    if (selectedModelId && !selectedServiceId) setSelectedServiceId(selectedModelId);
  }, [selectedModelId, selectedServiceId]);

  const selectService = (zabbixServiceId: string) => {
    setSelectedServiceId(zabbixServiceId);
    const root = rootOfService.get(zabbixServiceId);
    if (root && root !== zabbixServiceId) setSelectedModelId(root);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-blue-600"></i></div>;
  }

  if (services.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
        <i className="fas fa-sitemap text-4xl text-gray-300 mb-3"></i>
        <p className="text-gray-500">Данных пока нет.</p>
        <p className="text-gray-400 text-sm mt-1">Нажмите «Синхр. с Zabbix» (правая кнопка вверху, нужна роль admin), чтобы загрузить услуги.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Услуги</h1>
        <p className="text-gray-500 mt-1">
          Как настроены услуги и модели здоровья в Zabbix (живые данные): родители/дети, теги проблем, алгоритм вычисления состояния, распространение.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск услуги по имени…"
            className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={selectedModelId}
          onChange={e => setSelectedModelId(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-md"
        >
          {models.map(m => (
            <option key={m.rootId} value={m.rootId}>{m.rootName} ({m.count})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Список услуг */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="flex items-center justify-between px-2 pb-2">
            <h3 className="font-semibold text-gray-900 text-sm">
              {query ? `Найдено: ${shownList.length}` : 'Структура модели'}
            </h3>
            <span className="text-xs text-gray-400">{services.length} услуг всего</span>
          </div>
          <div className="space-y-1 max-h-[70vh] overflow-y-auto">
            {shownList.length === 0 && (
              <p className="text-gray-400 text-sm px-2 py-4 text-center">Ничего не найдено</p>
            )}
            {shownList.map(({ service, depth }) => (
              <button
                key={service.zabbix_serviceid}
                onClick={() => selectService(service.zabbix_serviceid)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-sm transition ${
                  selectedServiceId === service.zabbix_serviceid
                    ? 'bg-blue-50 ring-1 ring-blue-300'
                    : 'hover:bg-gray-50'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-none"
                  style={{ background: statusColor(service.status) }}
                  title={statusLabel(service.status)}
                />
                <span className="text-gray-400 font-mono text-xs flex-none">{service.zabbix_serviceid}</span>
                <span className="truncate" style={{ paddingLeft: Math.max(0, (depth - 1) * 14) }}>
                  {service.name}
                </span>
                {query && (
                  <span className="ml-auto text-gray-400 text-xs flex-none truncate max-w-[40%]">
                    {rootOfService.get(service.zabbix_serviceid) !== service.zabbix_serviceid
                      ? svcById.get(rootOfService.get(service.zabbix_serviceid) || '')?.name
                      : 'модель'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Карточка конфигурации (общий компонент; сама грузит живые данные из Zabbix) */}
        <div className="lg:col-span-3 min-h-[300px]">
          {selectedServiceId ? (
            <ServiceConfigCard
              serviceId={selectedServiceId}
              onSelectService={selectService}
            />
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center h-64 text-gray-400 border-dashed">
              Выберите услугу в списке слева
            </div>
          )}
        </div>
      </div>
    </div>
  );
}