import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { SLA, Service } from '../types';
import { DataSet } from 'vis-data';
import { Network, Options } from 'vis-network';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

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

interface SavedPos {
  x: number;
  y: number;
}

/**
 * Ручная раскладка дерева без vis-network layout/physics.
 * Позиции считаем сами (листья слева направо, внутренний узел — по центру детей),
 * поэтому перетаскивание работает сразу и держится: физики нет.
 */
export default function GraphPage({ onNavigate }: GraphPageProps) {
  const { showToast } = useToast();
  const { hasRole } = useAuth();
  const isAdmin = hasRole(['admin']);

  const [slas, setSlas] = useState<SLA[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<{ sla_id: number; service_id: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>(''); // zabbix_serviceid корня
  /** Раскладка выбранной модели: node_key → {x, y}. null = ещё грузится. */
  const [savedLayout, setSavedLayout] = useState<Map<string, SavedPos> | null>(null);
  /** Режим редактирования: true = узлы можно перемещать (кнопки «Сохранить»/«Отмена»). */
  const [editMode, setEditMode] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<any> | null>(null);
  const idToKeyRef = useRef<Map<string, string>>(new Map()); // vis id → node_key ("svc:.."/"sla:..")

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

  // ── Загрузка раскладки выбранной модели ──
  const modelId = scoped.model?.rootId ?? '';
  useEffect(() => {
    if (!modelId) {
      setSavedLayout(new Map());
      return;
    }
    let cancelled = false;
    networkRef.current?.destroy();
    networkRef.current = null;
    setSavedLayout(null); // режим загрузки
    setEditMode(false);   // смена модели выходит из режима редактирования
    api.getGraphPositions(modelId)
      .then(list => {
        if (cancelled) return;
        setSavedLayout(new Map(list.map(p => [p.node_key, { x: p.x, y: p.y }])));
      })
      .catch(() => {
        if (!cancelled) setSavedLayout(new Map());
      });
    return () => { cancelled = true; };
  }, [modelId]);

  useEffect(() => {
    if (scoped.services.length > 0 && containerRef.current && savedLayout !== null) {
      renderGraph(scoped, savedLayout);
    }
  }, [scoped, savedLayout]);

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

  /** Сохранить раскладку текущей модели для всех пользователей (только admin). */
  const persistLayout = async (): Promise<boolean> => {
    const network = networkRef.current;
    if (!network || !scoped.model) return false;
    const current = network.getPositions() as Record<string, SavedPos>;
    const positions: { node_key: string; x: number; y: number }[] = [];
    idToKeyRef.current.forEach((key, id) => {
      const pos = current[id];
      if (pos) positions.push({ node_key: key, x: pos.x, y: pos.y });
    });
    try {
      await api.saveGraphPositions(scoped.model.rootId, positions);
      // фиксируем в памяти как «последнее сохранённое» (из «Отмены» вернёмся сюда)
      setSavedLayout(new Map(positions.map(p => [p.node_key, { x: p.x, y: p.y }])));
      showToast('success', `Раскладка «${scoped.model.rootName}» сохранена для всех`);
      return true;
    } catch {
      showToast('error', 'Не удалось сохранить раскладку');
      return false;
    }
  };

  const handleEnterEdit = () => {
    setEditMode(true);
    networkRef.current?.setOptions({ interaction: { dragNodes: true } });
  };

  const handleSaveLayout = async () => {
    const ok = await persistLayout();
    if (ok) {
      setEditMode(false);
      networkRef.current?.setOptions({ interaction: { dragNodes: false } });
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    networkRef.current?.setOptions({ interaction: { dragNodes: false } });
    // возвращаем сохранённую раскладку (отбрасываем несохранённые движения)
    if (savedLayout !== null && scoped.services.length > 0 && containerRef.current) {
      renderGraph(scoped, savedLayout);
    }
  };

  const handleResetLayout = async () => {
    if (!scoped.model) return;
    try {
      await api.clearGraphPositions(scoped.model.rootId);
    } catch {
      // не критично — локально всё равно сбрасываем
    }
    setSavedLayout(new Map());
    setEditMode(false);
    networkRef.current?.setOptions({ interaction: { dragNodes: false } });
    showToast('success', `Раскладка «${scoped.model.rootName}» сброшена`);
  };

  const renderGraph = (view: ScopedView, saved: Map<string, SavedPos>) => {
    if (!containerRef.current) return;

    const childrenMap = new Map<string, string[]>();
    for (const s of view.services) {
      if (!s.parent_zabbix_serviceid) continue;
      const list = childrenMap.get(s.parent_zabbix_serviceid) || [];
      list.push(s.zabbix_serviceid);
      childrenMap.set(s.parent_zabbix_serviceid, list);
    }

    // Шаг по X не меньше ширины самой длинной подписи (чтобы узлы не пересекались)
    const maxLabelLen = Math.max(
      0,
      ...view.slas.map(s => s.name.length),
      ...view.services.map(s => s.name.length)
    );
    const spacingX = Math.max(300, maxLabelLen * 7.4 + 70);
    const spacingY = 200;
    const slaSpacingX = Math.max(280, maxLabelLen * 7.4 + 40);

    // Классическая раскладка дерева: листья слева направо,
    // внутренний узел — по центру своих детей.
    const posX = new Map<string, number>();
    let slot = 0;
    const assignX = (zid: string): number => {
      const kids = childrenMap.get(zid) || [];
      if (kids.length === 0) {
        const x = slot * spacingX;
        slot += 1;
        posX.set(zid, x);
        return x;
      }
      const xs = kids.map(assignX);
      const x = (Math.min(...xs) + Math.max(...xs)) / 2;
      posX.set(zid, x);
      return x;
    };
    if (view.model) assignX(view.model.rootId);
    // защита: если какой-то узел не попал в обход (битое дерево)
    for (const s of view.services) {
      if (!posX.has(s.zabbix_serviceid)) {
        posX.set(s.zabbix_serviceid, slot * spacingX);
        slot += 1;
      }
    }

    // Ряд SLA центрируем над деревом (y = 0), услуги — по глубине вниз
    const svcXs = view.services.map(s => posX.get(s.zabbix_serviceid) ?? 0);
    const minX = Math.min(...svcXs);
    const maxX = Math.max(...svcXs);
    const centerX = (minX + maxX) / 2;
    const startSlaX = view.slas.length > 1
      ? centerX - ((view.slas.length - 1) * slaSpacingX) / 2
      : centerX;

    idToKeyRef.current = new Map<string, string>();

    const nodes = new DataSet<any>([
      ...view.slas.map((sla, i) => {
        const id = `sla-${sla.id}`;
        const key = `sla:${sla.zabbix_slaid}`;
        idToKeyRef.current.set(id, key);
        const savedPos = saved.get(key);
        return {
          id,
          label: sla.name,
          x: savedPos ? savedPos.x : startSlaX + i * slaSpacingX,
          y: savedPos ? savedPos.y : 0,
          fixed: !!savedPos,
          shape: 'box',
          color: { background: '#3B82F6', border: '#2563EB', highlight: { background: '#60A5FA', border: '#3B82F6' } },
          font: { color: '#ffffff', size: 14, face: 'Inter, sans-serif' },
          borderWidth: 2,
          shadow: true,
          margin: 12,
        };
      }),
      ...view.services.map(svc => {
        const depth = view.depth.get(svc.zabbix_serviceid) ?? 1;
        const isRoot = depth === 1;
        const id = `svc-${svc.id}`;
        const key = `svc:${svc.zabbix_serviceid}`;
        idToKeyRef.current.set(id, key);
        const savedPos = saved.get(key);
        return {
          id,
          label: svc.name,
          x: savedPos ? savedPos.x : posX.get(svc.zabbix_serviceid)!,
          y: savedPos ? savedPos.y : depth * spacingY,
          fixed: !!savedPos,
          shape: isRoot ? 'box' : 'ellipse',
          color: isRoot
            ? { background: '#7C3AED', border: '#6D28D9', highlight: { background: '#8B5CF6', border: '#7C3AED' } }
            : { background: '#8B5CF6', border: '#7C3AED', highlight: { background: '#A78BFA', border: '#8B5CF6' } },
          font: { color: '#ffffff', size: isRoot ? 13 : 11, face: 'Inter, sans-serif' },
          borderWidth: isRoot ? 3 : 2,
          shadow: true,
          margin: 10,
        };
      }),
    ]);
    nodesRef.current = nodes;

    const edges = new DataSet<any>([
      ...view.links.map(link => ({
        from: `sla-${link.sla_id}`,
        to: `svc-${link.service_id}`,
        color: { color: '#94A3B8', highlight: '#3B82F6' },
        width: 2,
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      })),
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

    // Физика выключена, иерархический layout не используется:
    // позиции заданы явно. Перетаскивание узлов доступно только в режиме
    // редактирования (кнопка «Редактировать граф»), иначе граф заморожен.
    const options: Options = {
      physics: { enabled: false },
      layout: { improvedLayout: false },
      edges: { smooth: false },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        dragNodes: editMode,
        dragView: true,
      },
    };

    if (networkRef.current) {
      networkRef.current.destroy();
    }

    const network = new Network(containerRef.current, { nodes, edges }, options);
    networkRef.current = network;
    network.fit({ animation: false });

    network.on('click', (params: any) => {
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
          <h1 className="text-2xl font-bold text-gray-900">Модель здоровья</h1>
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
            {isAdmin && scoped.model && (
              <div className="flex items-center gap-2">
                {editMode ? (
                  <>
                    <button
                      onClick={handleSaveLayout}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition"
                      title="Сохранить раскладку для всех и выйти из редактирования"
                    >
                      <i className="fas fa-save text-xs"></i>
                      Сохранить
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition"
                      title="Отменить изменения и вернуть сохранённую раскладку"
                    >
                      <i className="fas fa-times text-xs"></i>
                      Отмена
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleEnterEdit}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                    title="Включить перемещение узлов графа"
                  >
                    <i className="fas fa-pen text-xs"></i>
                    Редактировать граф
                  </button>
                )}
                <button
                  onClick={handleResetLayout}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition"
                  title="Сбросить раскладку модели к стандартной (для всех пользователей)"
                >
                  <i className="fas fa-undo text-xs"></i>
                  Сбросить раскладку
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500">
            {editMode ? (
              <>
                <i className="fas fa-hand-pointer mr-1 text-gray-400"></i>
                Режим редактирования: перетащите узлы на новые места и нажмите «Сохранить» — раскладка станет общей для всех пользователей.
              </>
            ) : isAdmin ? (
              <>
                <i className="fas fa-lock mr-1 text-gray-400"></i>
                Граф в режиме просмотра. Нажмите «Редактировать граф», чтобы перемещать узлы.
              </>
            ) : (
              <>
                <i className="fas fa-lock mr-1 text-gray-400"></i>
                Раскладку графа может изменять только администратор.
              </>
            )}
          </p>

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