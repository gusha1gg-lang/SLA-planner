import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { SLA, Service } from '../types';
import { DataSet } from 'vis-data';
import { Network, Options } from 'vis-network';
import { useToast } from '../context/ToastContext';

interface GraphPageProps {
  onNavigate?: (page: string, params?: Record<string, string>) => void;
}

/**
 * Модель здоровья = дерево услуг от корневого сервиса (услуги без родителя).
 * В Zabbix 7.0 кнопка — «Модель здоровья» (service tree).
 */
interface HealthModel {
  rootId: string;      // zabbix_serviceid корня
  rootName: string;    // имя корня = имя модели
  serviceIds: Set<string>; // zabbix_serviceid всех узлов дерева (корень + потомки)
}

/** Данные, отображаемые для выбранной модели здоровья. */
interface ScopedView {
  model: HealthModel | null;
  slas: SLA[];
  services: Service[];
  links: { sla_id: number; service_id: number }[];
  /** zabbix_serviceid → глубина в дереве (корень = 1). */
  depth: Map<string, number>;
}

export default function GraphPage({ onNavigate }: GraphPageProps) {
  const { showToast } = useToast();
  const [slas, setSlas] = useState<SLA[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<{ sla_id: number; service_id: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>(''); // zabbix_serviceid корня
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);

  // ── Список моделей здоровья (корни + все потомки) ──
  const models = useMemo<HealthModel[]>(() => {
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
  }, [services]);

  useEffect(() => {
    loadData();
  }, []);

  // По умолчанию — первая модель
  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      setSelectedModel(models[0].rootId);
    }
  }, [models, selectedModel]);

  // ── Данные выбранной модели: её дерево + SLA, связанные с ним ──
  const scoped = useMemo<ScopedView>(() => {
    const model = models.find(m => m.rootId === selectedModel);
    if (!model) {
      return { model: null, slas: [], services: [], links: [], depth: new Map() };
    }
    const svcIn = services.filter(s => model.serviceIds.has(s.zabbix_serviceid));
    const svcById = new Map(svcIn.map(s => [s.id, s]));

    // Глубина каждого узла: корень = 1, дети = 2, внуки = 3 и т.д.
    const childrenMap = new Map<string, string[]>();
    for (const s of svcIn) {
      if (!s.parent_zabbix_serviceid) continue;
      const list = childrenMap.get(s.parent_zabbix_serviceid) || [];
      list.push(s.zabbix_serviceid);
      childrenMap.set(s.parent_zabbix_serviceid, list);
    }
    const depth = new Map<string, number>();
    const stack: Array<[string, number]> = [[model.rootId, 1]];
    while (stack.length) {
      const [id, d] = stack.pop()!;
      if (depth.has(id)) continue;
      depth.set(id, d);
      for (const c of childrenMap.get(id) || []) stack.push([c, d + 1]);
    }

    const scopedLinks = links.filter(l => svcById.has(l.service_id));
    const slaIds = new Set(scopedLinks.map(l => l.sla_id));
    return {
      model,
      slas: slas.filter(s => slaIds.has(s.id)),
      services: svcIn,
      links: scopedLinks,
      depth,
    };
  }, [models, selectedModel, slas, services, links]);

  useEffect(() => {
    if (scoped.services.length > 0 && containerRef.current) {
      renderGraph(scoped);
    }
  }, [scoped]);

  const loadData = async () => {
    try {
      const [s, svc, l] = await Promise.all([
        api.getSLAs(),
        api.getServices(),
        api.getSLAServiceLinks(),
      ]);
      setSlas(s);
      setServices(svc);
      setLinks(l);
    } finally {
      setLoading(false);
    }
  };

  const renderGraph = (view: ScopedView) => {
    if (!containerRef.current) return;

    const nodes = new DataSet<any>([
      ...view.slas.map(sla => ({
        id: `sla-${sla.id}`,
        label: sla.name,
        shape: 'box',
        color: { background: '#3B82F6', border: '#2563EB', highlight: { background: '#60A5FA', border: '#3B82F6' } },
        font: { color: '#ffffff', size: 14, face: 'Inter, sans-serif' },
        borderWidth: 2,
        shadow: true,
        margin: 12,
        level: 0,
      })),
      ...view.services.map(svc => {
        const depth = view.depth.get(svc.zabbix_serviceid) ?? 1;
        const isRoot = depth === 1;
        return {
          id: `svc-${svc.id}`,
          label: svc.name,
          shape: isRoot ? 'box' : 'ellipse',
          color: isRoot
            ? { background: '#7C3AED', border: '#6D28D9', highlight: { background: '#8B5CF6', border: '#7C3AED' } }
            : { background: '#8B5CF6', border: '#7C3AED', highlight: { background: '#A78BFA', border: '#8B5CF6' } },
          font: { color: '#ffffff', size: isRoot ? 13 : 11, face: 'Inter, sans-serif' },
          borderWidth: isRoot ? 3 : 2,
          shadow: true,
          margin: 10,
          // Глубина в дереве, а не «корень/не-корень»: уровень = реальный ярус,
          // иначе внуки встают в тот же ряд, что и дети («в боку», а не вниз).
          level: depth,
        };
      }),
    ]);

    const edges = new DataSet<any>([
      // SLA → Service links
      ...view.links.map(link => ({
        from: `sla-${link.sla_id}`,
        to: `svc-${link.service_id}`,
        color: { color: '#94A3B8', highlight: '#3B82F6' },
        width: 2,
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      })),
      // Service → Service (parent)
      ...view.services
        .filter(s => s.parent_zabbix_serviceid)
        .map(s => {
          const parent = view.services.find(p => p.zabbix_serviceid === s.parent_zabbix_serviceid);
          if (!parent) return null;
          return {
            from: `svc-${parent.id}`,
            to: `svc-${s.id}`,
            color: { color: '#CBD5E1', highlight: '#8B5CF6' },
            width: 1.5,
            dashes: true,
            arrows: { to: { enabled: true, scaleFactor: 0.4 } },
          };
        })
        .filter(Boolean),
    ]);

    const options: Options = {
      physics: {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -3000,
          centralGravity: 0.3,
          springLength: 150,
          springConstant: 0.04,
        },
        stabilization: { iterations: 100 },
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
      },
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'UD',
          sortMethod: 'level',
          levelSeparation: 120,
          nodeSpacing: 160,
        },
      },
    };

    if (networkRef.current) {
      networkRef.current.destroy();
    }

    networkRef.current = new Network(containerRef.current, { nodes, edges }, options);

    // Add click handler for nodes
    networkRef.current.on('click', (params: any) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        if (nodeId.startsWith('sla-')) {
          const slaId = nodeId.replace('sla-', '');
          const sla = slas.find(s => s.id.toString() === slaId);
          if (sla && onNavigate) {
            onNavigate('sla-detail', { id: sla.zabbix_slaid });
            showToast('info', `Открыт SLA: ${sla.name}`);
          }
        }
      }
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-blue-600"></i></div>;
  }

  const noData = services.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Граф SLA и услуг</h1>
          <p className="text-gray-500 mt-1">Модели здоровья (деревья услуг) из Zabbix → SLA по тегам</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-3 h-3 rounded bg-blue-500"></span> SLA
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-3 h-3 rounded bg-purple-700"></span> Модель (корень)
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-3 h-3 rounded-full bg-purple-500"></span> Услуга
          </div>
        </div>
      </div>

      {noData ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <i className="fas fa-project-diagram text-4xl text-gray-300 mb-3"></i>
          <p className="text-gray-500">Данных пока нет.</p>
          <p className="text-gray-400 text-sm mt-1">Нажмите «Синхр. с Zabbix» (правая кнопка вверху, нужна роль admin), чтобы загрузить SLA и услуги.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700">
              Модель здоровья:
            </label>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-xl"
            >
              {models.map(m => (
                <option key={m.rootId} value={m.rootId}>
                  {m.rootName} ({m.serviceIds.size})
                </option>
              ))}
            </select>
            {scoped.model && (
              <span className="text-sm text-gray-500">
                SLA: <b className="text-gray-700">{scoped.slas.length}</b> · Услуг: <b className="text-gray-700">{scoped.services.length}</b> из {scoped.model.serviceIds.size}
              </span>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div ref={containerRef} className="w-full h-[600px]" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">SLA ({scoped.slas.length})</h3>
              {scoped.slas.length === 0 ? (
                <p className="text-gray-400 text-sm">К этой модели не привязан ни один SLA</p>
              ) : (
                <div className="space-y-2">
                  {scoped.slas.map(sla => (
                    <div key={sla.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{sla.name}</span>
                      <span className="text-gray-400 font-mono text-xs">slaid={sla.zabbix_slaid}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Услуги ({scoped.services.length})</h3>
              <div className="space-y-2">
                {scoped.services.map(svc => (
                  <div key={svc.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">
                      {svc.parent_zabbix_serviceid ? (
                        <i className="fas fa-level-up-alt text-gray-300 mr-2 text-xs"></i>
                      ) : (
                        <i className="fas fa-th-large text-purple-700 mr-2 text-xs"></i>
                      )}
                      {svc.name}
                    </span>
                    <span className="text-gray-400 font-mono text-xs">id={svc.zabbix_serviceid}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}