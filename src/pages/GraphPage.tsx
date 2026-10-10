import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { SLA, Service } from '../types';
import ServiceConfigCard from '../components/ServiceConfigCard';
import SLADetailCard from '../components/SLADetailCard';
import ModelTree from '../components/ModelTree';
import { DataSet } from 'vis-data';
import { Network, Options } from 'vis-network';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../permissions';

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

interface NodeColors {
  sla: string;
  service: string;
}

/** Сгенерировать цвет узла из базового: pct > 0 — светлее, pct < 0 — темнее. */
function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const channel = (c: number) =>
    pct >= 0 ? clamp(c + (255 - c) * pct) : clamp(c * (1 + pct));
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Цвета узла SLA (синий по умолчанию). */
function slaNodeColor(base: string) {
  return {
    background: base,
    border: shade(base, -0.18),
    highlight: { background: shade(base, 0.15), border: base },
  };
}

/** Цвета узла услуги: корень дерева чуть темнее базового, дети — базовый. */
function serviceNodeColor(base: string, isRoot: boolean) {
  return isRoot
    ? { background: shade(base, -0.12), border: shade(base, -0.3), highlight: { background: base, border: shade(base, -0.12) } }
    : { background: base, border: shade(base, -0.12), highlight: { background: shade(base, 0.15), border: base } };
}

/**
 * Ручная раскладка дерева без vis-network layout/physics.
 * Позиции считаем сами (листья слева направо, внутренний узел — по центру детей),
 * поэтому перетаскивание работает сразу и держится: физики нет.
 */
export default function GraphPage() {
  const { showToast } = useToast();
  const { can } = useAuth();
  const canEditGraph = can(PERMISSIONS.graphEdit);

  const [slas, setSlas] = useState<SLA[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<{ sla_id: number; service_id: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>(''); // zabbix_serviceid корня
  /** Раскладка выбранной модели: node_key → {x, y}. null = ещё грузится. */
  const [savedLayout, setSavedLayout] = useState<Map<string, SavedPos> | null>(null);
  /** rootId модели, для которой загружена/актуальна savedLayout (защита от «мигания» раскладкой чужой модели). */
  const [savedLayoutModel, setSavedLayoutModel] = useState<string>('');
  /** Режим редактирования: true = узлы можно перемещать (кнопки «Сохранить»/«Отмена»). */
  const [editMode, setEditMode] = useState(false);
  /** Выбранный на графе SLA (zabbix_slaid) — детали показываем под графом. */
  const [selectedSlaId, setSelectedSlaId] = useState('');
  /** Выбранная на графе услуга (zabbix_serviceid) — конфигурацию показываем под графом. */
  const [selectedServiceId, setSelectedServiceId] = useState('');
  /** vis-id узла, выделенного в прошлый раз (чтобы снять подсветку при смене выбора). */
  const prevSelectedVisIdRef = useRef<string | null>(null);

  /** Цвета узлов SLA и услуг (общие для всех моделей; настраивает admin). */
  const [nodeColors, setNodeColors] = useState<NodeColors>({ sla: '#3B82F6', service: '#8B5CF6' });
  const saveColorsTimer = useRef<number | null>(null);

  const editModeRef = useRef(false);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);

  /** Состояние собственного перетаскивания узлов (в vis оно выключено). */
  const dragSelRef = useRef<null | {
    groupIds: string[];
    startPixel: { x: number; y: number };
    startCanvas: { x: number; y: number };
    startPos: Record<string, { x: number; y: number }>;
    moved: boolean;
  }>(null);
  /** true = после реального перетаскивания — проглотить следующий click vis. */
  const suppressClickRef = useRef(false);

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
      setSavedLayoutModel('');
      return;
    }
    let cancelled = false;
    networkRef.current?.destroy();
    networkRef.current = null;
    setSavedLayoutModel(modelId);
    setSavedLayout(null); // режим загрузки
    setEditMode(false);   // смена модели выходит из режима редактирования
    api.getGraphPositions(modelId)
      .then(list => {
        if (cancelled) return;
        setSavedLayoutModel(modelId);
        setSavedLayout(new Map(list.map(p => [p.node_key, { x: p.x, y: p.y }])));
      })
      .catch(() => {
        if (!cancelled) {
          setSavedLayoutModel(modelId);
          setSavedLayout(new Map());
        }
      });
    return () => { cancelled = true; };
  }, [modelId]);

  useEffect(() => {
    // рендерим граф ТОЛЬКО с раскладкой, загруженной для текущей модели
    // (иначе при переключении моделей успевал мелькнуть граф со «старой» раскладкой)
    if (scoped.services.length > 0 && containerRef.current &&
        savedLayout !== null && savedLayoutModel === modelId) {
      renderGraph(scoped, savedLayout);
    }
  }, [scoped, savedLayout, savedLayoutModel, modelId]);

  // ── Собственное перетаскивание узлов в режиме редактирования ──
  // (в vis-network dragNodes выключен: его хит-тест для части узлов не срабатывает.
  //  Здесь ищем узел по нашим bounding box, а двигаем через network.moveNode —
  //  поэтому тянутся гарантированно ВСЕ узлы; услуга едет вместе со своим поддеревом.)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !editMode || !scoped.model) return;

    // страховка: узлы точно не fixed (vis не двигает fixed-узлы)
    if (nodesRef.current) {
      const ids = nodesRef.current.getIds();
      nodesRef.current.update(ids.map(id => ({ id, fixed: false })));
    }

    const toPixel = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    // Хит-тест по bounding box каждого узла (переводим в пиксели контейнера)
    const hitTest = (pixel: { x: number; y: number }): string | null => {
      const n = networkRef.current;
      if (!n) return null;
      const positions = n.getPositions() as Record<string, { x: number; y: number }>;
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const id in positions) {
        let box: any;
        try { box = n.getBoundingBox(id); } catch { continue; }
        if (!box) continue;
        const tl = n.canvasToDOM({ x: box.left, y: box.top });
        const br = n.canvasToDOM({ x: box.right, y: box.bottom });
        const pad = 6;
        if (pixel.x >= tl.x - pad && pixel.x <= br.x + pad &&
            pixel.y >= tl.y - pad && pixel.y <= br.y + pad) {
          const c = n.canvasToDOM({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });
          const d = Math.hypot(pixel.x - c.x, pixel.y - c.y);
          if (d < bestDist) { bestDist = d; bestId = id; }
        }
      }
      return bestId;
    };

    // Группа: сама услуга + её поддерево (SLA — одиночно)
    const buildGroup = (startId: string): string[] => {
      if (!startId.startsWith('svc-')) return [startId];
      const childIds = new Map<string, string[]>();
      for (const s of scoped.services) {
        if (!s.parent_zabbix_serviceid) continue;
        const parent = scoped.services.find(p => p.zabbix_serviceid === s.parent_zabbix_serviceid);
        if (!parent) continue;
        const pid = `svc-${parent.id}`;
        const cid = `svc-${s.id}`;
        childIds.set(pid, [...(childIds.get(pid) || []), cid]);
      }
      const out: string[] = [];
      const stack = [startId];
      while (stack.length) {
        const id = stack.pop()!;
        out.push(id);
        stack.push(...(childIds.get(id) || []));
      }
      return out;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const n = networkRef.current;
      if (!n) return;
      const id = hitTest(toPixel(e));
      if (!id) return;
      const groupIds = buildGroup(id);
      const positions = n.getPositions() as Record<string, { x: number; y: number }>;
      const startPos: Record<string, { x: number; y: number }> = {};
      groupIds.forEach(g => { if (positions[g]) startPos[g] = { ...positions[g] }; });
      dragSelRef.current = {
        groupIds,
        startPixel: toPixel(e),
        startCanvas: n.DOMtoCanvas(toPixel(e)),
        startPos,
        moved: false,
      };
      el.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      const d = dragSelRef.current;
      const n = networkRef.current;
      if (!d || !n || d.groupIds.length === 0) return;
      const pixel = toPixel(e);
      if (!d.moved && Math.abs(pixel.x - d.startPixel.x) < 3 && Math.abs(pixel.y - d.startPixel.y) < 3) return;
      d.moved = true;
      const cur = n.DOMtoCanvas(pixel);
      const cdx = cur.x - d.startCanvas.x;
      const cdy = cur.y - d.startCanvas.y;
      for (const gid of d.groupIds) {
        const p0 = d.startPos[gid];
        if (p0) n.moveNode(gid, p0.x + cdx, p0.y + cdy);
      }
    };
    const onUp = () => {
      if (dragSelRef.current?.moved) suppressClickRef.current = true;
      dragSelRef.current = null;
      el.style.cursor = 'grab';
    };

    el.style.cursor = 'grab';
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.style.cursor = '';
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [editMode, scoped.model, scoped.services]);

  // ── Перекраска существующего графа при загрузке/смене цветов ──
  // (renderGraph пересоздаёт сеть только по модели/раскладке; здесь докрашиваем узлы на лету)
  useEffect(() => {
    applyNodeColors(nodeColors);
  }, [nodeColors]); // eslint-disable-line react-hooks/exhaustive-deps

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
    try {
      const colors = await api.getGraphColors();
      setNodeColors({ sla: colors.sla || '#3B82F6', service: colors.service || '#8B5CF6' });
    } catch {
      // нет доступа/сеть — остаёмся на дефолтных цветах
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
      setSavedLayoutModel(scoped.model.rootId);
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
    // в vis узлы не таскаем сами: выключаем встроенный dragView, чтобы он не конфликтовал
    networkRef.current?.setOptions({ interaction: { dragView: false } });
  };

  const handleSaveLayout = async () => {
    const ok = await persistLayout();
    if (ok) {
      setEditMode(false);
      networkRef.current?.setOptions({ interaction: { dragView: true } });
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    networkRef.current?.setOptions({ interaction: { dragView: true } });
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
    setSavedLayoutModel(scoped.model.rootId);
    setEditMode(false);
    networkRef.current?.setOptions({ interaction: { dragView: true } });
    showToast('success', `Раскладка «${scoped.model.rootName}» сброшена`);
  };

  /** Перекрасить уже созданный граф без пересоздания сети (по vis-id узла). */
  const applyNodeColors = (colors: NodeColors) => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    nodes.getIds().forEach(id => {
      const node = nodes.get(id) as any;
      if (!node) return;
      let color: ReturnType<typeof slaNodeColor | typeof serviceNodeColor>;
      if (String(id).startsWith('sla-')) {
        color = slaNodeColor(colors.sla);
      } else if (String(id).startsWith('svc-')) {
        color = serviceNodeColor(colors.service, node.shape === 'box');
      } else {
        return;
      }
      nodes.update({ id, color });
    });
  };

  /** Сменить цвет типа узла: мгновенно на графе, в БД — через debounce. */
  const handleColorChange = (type: 'sla' | 'service', value: string) => {
    const next: NodeColors = { ...nodeColors, [type]: value };
    setNodeColors(next);
    applyNodeColors(next);
    if (saveColorsTimer.current) window.clearTimeout(saveColorsTimer.current);
    saveColorsTimer.current = window.setTimeout(async () => {
      try {
        await api.saveGraphColors(next);
      } catch {
        showToast('error', 'Не удалось сохранить цвета');
      }
    }, 400);
  };

  /** Переключить выбранную услугу (из карточки конфигурации/связанных услуг) —
   *  при необходимости меняем модель, чтобы узел оказался на графе. */
  const selectServiceByZid = (zabbixServiceId: string) => {
    setSelectedServiceId(zabbixServiceId);
    setSelectedSlaId('');
    const model = models.find(m => m.serviceIds.has(zabbixServiceId));
    if (model) setSelectedModel(model.rootId);
  };

  /** vis-id выбранного узла (в текущей модели) или null. */
  const selectedVisId = useMemo(() => {
    if (selectedServiceId) {
      const svc = scoped.services.find(s => s.zabbix_serviceid === selectedServiceId);
      return svc ? `svc-${svc.id}` : null;
    }
    if (selectedSlaId) {
      const sla = scoped.slas.find(s => s.zabbix_slaid === selectedSlaId);
      return sla ? `sla-${sla.id}` : null;
    }
    return null;
  }, [selectedServiceId, selectedSlaId, scoped.slas, scoped.services]);

  /** Подсветить выбранный узел (толще обводка + тень), предыдущий — вернуть к обычному виду. */
  const applySelectionHighlight = (nextVisId: string | null) => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    const prev = prevSelectedVisIdRef.current;
    if (prev && prev !== nextVisId) {
      const n = nodes.get(prev) as any;
      if (n) nodes.update({ id: prev, borderWidth: n._defaultBorderWidth ?? n.borderWidth, shadow: n._defaultShadow ?? false });
    }
    if (nextVisId) {
      const n = nodes.get(nextVisId) as any;
      if (n) {
        nodes.update({
          id: nextVisId,
          borderWidth: (n._defaultBorderWidth ?? n.borderWidth) + 3,
          shadow: { color: '#00000080', size: 24, x: 0, y: 0 },
        });
      }
    }
    prevSelectedVisIdRef.current = nextVisId;
  };

  // при смене выбора — обновляем подсветку узла (граф при этом не пересоздаётся)
  useEffect(() => {
    applySelectionHighlight(selectedVisId);
  }, [selectedVisId]); // eslint-disable-line react-hooks/exhaustive-deps

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
          // fixed не ставим: заморозку режима просмотра даёт interaction.dragNodes=false,
          // иначе после «Сохранить» узлы становятся fixed и перестают двигаться даже в редактировании.
          fixed: false,
          shape: 'box',
          color: slaNodeColor(nodeColors.sla),
          font: { color: '#ffffff', size: 14, face: 'Inter, sans-serif' },
          borderWidth: 2,
          _defaultBorderWidth: 2,
          shadow: true,
          _defaultShadow: true,
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
          // fixed не ставим: см. комментарий выше (иначе после сохранения узлы «застывают»)
          fixed: false,
          shape: isRoot ? 'box' : 'ellipse',
          color: serviceNodeColor(nodeColors.service, isRoot),
          font: { color: '#ffffff', size: isRoot ? 13 : 11, face: 'Inter, sans-serif' },
          borderWidth: isRoot ? 3 : 2,
          _defaultBorderWidth: isRoot ? 3 : 2,
          shadow: true,
          _defaultShadow: true,
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

    // Физика выключена, иерархический layout не используется; позиции заданы явно.
    // Перетаскивание УЗЛОВ всегда отключено в vis (пытаемся двигать сами через
    // pointer-обработчик выше). В режиме просмотра доступно панорамирование (dragView),
    // в режиме редактирования — свои pointer-события (пан отключён, чтобы не конфликтовать).
    const options: Options = {
      physics: { enabled: false },
      layout: { improvedLayout: false },
      edges: { smooth: false },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        dragNodes: false,
        dragView: !editMode,
      },
    };

    if (networkRef.current) {
      networkRef.current.destroy();
    }

    const network = new Network(containerRef.current, { nodes, edges }, options);
    networkRef.current = network;
    network.fit({ animation: false });

    network.on('click', (params: any) => {
      // после реального перетаскивания vis может прислать click — глушим его
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      // клик по узлу (вне режима редактирования) — выбираем ему и показываем детали под графом
      if (params.nodes.length > 0 && !editModeRef.current) {
        const nodeId = params.nodes[0];
        if (nodeId.startsWith('sla-')) {
          const dbId = nodeId.replace('sla-', '');
          const sla = view.slas.find(s => s.id.toString() === dbId);
          if (sla) {
            setSelectedSlaId(sla.zabbix_slaid);
            setSelectedServiceId('');
          }
        } else if (nodeId.startsWith('svc-')) {
          const dbId = nodeId.replace('svc-', '');
          const svc = view.services.find(s => s.id.toString() === dbId);
          if (svc) {
            setSelectedServiceId(svc.zabbix_serviceid);
            setSelectedSlaId('');
          }
        }
      }
    });

    // граф пересоздан — вернуть подсветку выбранного узла
    applySelectionHighlight(selectedVisId);
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
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-3 h-3 rounded" style={{ background: nodeColors.sla }}></span> SLA
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-3 h-3 rounded" style={{ background: shade(nodeColors.service, -0.15) }}></span> Модель (корень)
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-3 h-3 rounded-full" style={{ background: nodeColors.service }}></span> Услуга
          </div>
          {canEditGraph && (
            <div className="flex items-center gap-3 border-l border-gray-200 pl-3">
              <label className="flex items-center gap-1.5 text-sm text-gray-600" title="Цвет SLA — общий для всех моделей">
                <span className="font-medium">Цвет SLA</span>
                <input
                  type="color"
                  value={nodeColors.sla}
                  onChange={e => handleColorChange('sla', e.target.value)}
                  className="w-7 h-7 cursor-pointer rounded border border-gray-200 bg-white"
                />
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-600" title="Цвет услуг — общий для всех моделей">
                <span className="font-medium">Цвет услуг</span>
                <input
                  type="color"
                  value={nodeColors.service}
                  onChange={e => handleColorChange('service', e.target.value)}
                  className="w-7 h-7 cursor-pointer rounded border border-gray-200 bg-white"
                />
              </label>
            </div>
          )}
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
              onChange={e => {
                setSelectedModel(e.target.value);
                // смена модели сбрасывает выбор узла (панель деталей ниже графа)
                setSelectedSlaId('');
                setSelectedServiceId('');
              }}
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
            {canEditGraph && scoped.model && (
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
                Режим редактирования: перетащите узлы на новые места и нажмите «Сохранить» — раскладка станет общей для всех пользователей. Потянув услугу, её поддерево едет следом.
              </>
            ) : canEditGraph ? (
              <>
                <i className="fas fa-lock mr-1 text-gray-400"></i>
                Граф в режиме просмотра. Нажмите «Редактировать граф», чтобы перемещать узлы.
              </>
            ) : (
              <>
                <i className="fas fa-lock mr-1 text-gray-400"></i>
                Раскладку графа может изменять только пользователь с правом «Граф: редактирование».
              </>
            )}
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
            {/* Граф */}
            <div className="relative bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-w-0">
              <div ref={containerRef} className="w-full h-[600px]" />
              {savedLayout === null && scoped.model && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <i className="fas fa-spinner fa-spin text-xl text-blue-600"></i>
                    Загрузка раскладки…
                  </div>
                </div>
              )}
            </div>

            {/* Структура модели — справа от графа */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 max-h-[50vh] lg:max-h-none lg:h-[600px] overflow-y-auto">
              <div className="flex items-center justify-between px-2 pb-2">
                <h3 className="font-semibold text-gray-900 text-sm">Структура модели</h3>
                <span className="text-xs text-gray-400">{scoped.services.length} услуг</span>
              </div>
              {scoped.model && (
                <ModelTree
                  rootId={scoped.model.rootId}
                  services={scoped.services}
                  selectedServiceId={selectedServiceId}
                  onSelect={selectServiceByZid}
                />
              )}
            </div>
          </div>

          {/* Детали выбранного узла (SLA или услуга) — под графом */}
          {selectedSlaId ? (
            <SLADetailCard
              slaId={selectedSlaId}
              onClose={() => setSelectedSlaId('')}
              onSelectService={selectServiceByZid}
            />
          ) : selectedServiceId ? (
            <ServiceConfigCard
              serviceId={selectedServiceId}
              onClose={() => setSelectedServiceId('')}
              onSelectService={selectServiceByZid}
            />
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-dashed border-gray-200 p-8 text-center text-gray-400">
              <i className="fas fa-mouse-pointer text-2xl mb-2"></i>
              <p className="text-sm">
                Кликните на SLA или услугу на графе — детали появятся здесь, под графом
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}