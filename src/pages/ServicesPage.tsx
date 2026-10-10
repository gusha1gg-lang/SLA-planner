import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { Service, ServiceConfig } from '../types';

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

// Статус услуги Zabbix 7.0: -1 = OK, 0..5 = критичность самой серьёзной проблемы.
const STATUS_LABELS: Record<number, string> = {
  [-1]: 'OK',
  0: 'Не классифицировано',
  1: 'Информация',
  2: 'Предупреждение',
  3: 'Средняя',
  4: 'Высокая',
  5: 'Катастрофа',
};

// Цвета статусов — как в Zabbix (default severity colors).
const STATUS_COLORS: Record<number, string> = {
  [-1]: '#59DB8F',
  0: '#A9A9A9',
  1: '#7499FF',
  2: '#FFC859',
  3: '#FFA059',
  4: '#E97659',
  5: '#E45959',
};

// Пояснения для ИТ: как считается статус услуги (алгоритм Zabbix 7.0).
const ALGORITHM_HINTS: Record<number, string> = {
  0: 'Статус услуги всегда «OK»: дочерние услуги не влияют (ручное управление).',
  1: 'Статус = самый критичный из дочерних ТОЛЬКО если все дочерние услуги в проблеме; иначе — OK.',
  2: 'Статус = самый критичный из дочерних услуг/проблем: если хотя бы одна дочерняя услуга недоступна (или есть проблема по тегу) — услуга в проблеме с тем же статусом.',
};

// Пояснения для ИТ: что значит правило распространения состояния.
const PROPAGATION_HINTS: Record<number, string> = {
  0: 'Статус передаётся родителю без изменений.',
  1: 'Статус, передаваемый родителю, повышается на заданное число шагов критичности.',
  2: 'Статус, передаваемый родителю, понижается на заданное число шагов критичности.',
  3: 'Услуга игнорируется: её статус не влияет на статус родителя.',
  4: 'Родителю всегда передаётся фиксированный статус.',
};

function statusColor(status: number): string {
  return STATUS_COLORS[status] ?? '#A9A9A9';
}

function statusLabel(status: number): string {
  return STATUS_LABELS[status] ?? String(status);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Строка «поле» карточки конфигурации. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-sm text-gray-800 mt-0.5">{children}</div>
    </div>
  );
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedModelId, setSelectedModelId] = useState(''); // корень модели
  const [search, setSearch] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');

  const [config, setConfig] = useState<ServiceConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');

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

  // Загрузка живой конфигурации выбранной услуги
  useEffect(() => {
    if (!selectedServiceId) {
      setConfig(null);
      return;
    }
    let cancelled = false;
    setConfigLoading(true);
    setConfigError('');
    api.getServiceConfig(selectedServiceId)
      .then(c => { if (!cancelled) setConfig(c); })
      .catch(e => {
        if (!cancelled) {
          setConfig(null);
          setConfigError(e.message || 'Не удалось загрузить конфигурацию');
        }
      })
      .finally(() => { if (!cancelled) setConfigLoading(false); });
    return () => { cancelled = true; };
  }, [selectedServiceId]);

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

        {/* Карточка конфигурации */}
        <div className="lg:col-span-3 min-h-[300px]">
          {configLoading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center h-64">
              <span className="flex items-center gap-2 text-gray-500 text-sm">
                <i className="fas fa-spinner fa-spin text-xl text-blue-600"></i>
                Загрузка конфигурации из Zabbix…
              </span>
            </div>
          ) : configError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
              <i className="fas fa-exclamation-triangle mr-2"></i>{configError}
            </div>
          ) : config ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
              {/* Заголовок */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{config.name}</h2>
                  <p className="text-gray-400 font-mono text-xs mt-0.5">
                    id={config.serviceid}
                    {config.readonly && <span className="ml-3 text-amber-600"><i className="fas fa-lock mr-1"></i>только чтение в Zabbix</span>}
                  </p>
                </div>
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-semibold text-white flex-none"
                  style={{ background: statusColor(config.status) }}
                >
                  {config.status_label}
                </span>
              </div>

              {/* Основные поля */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Родительские услуги">
                  {config.parents.length === 0 ? (
                    <span className="text-gray-500">Нет (корень модели)</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {config.parents.map(p => (
                        <button
                          key={p.serviceid}
                          onClick={() => selectService(p.serviceid)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-xs transition"
                        >
                          <span className="w-2 h-2 rounded-full flex-none" style={{ background: statusColor(p.status) }} />
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </Field>
                <Field label="Порядок сортировки (0→999)">{config.sortorder}</Field>
                <div className="md:col-span-2">
                  <Field label="Правило вычисления состояния">
                    {config.algorithm_label}
                  </Field>
                  <p className="text-xs text-gray-500 mt-1">{ALGORITHM_HINTS[config.algorithm]}</p>
                </div>
                <Field label="Описание">
                  {config.description || <span className="text-gray-400">—</span>}
                </Field>
                <Field label="Создано в">{formatDate(config.created_at)}</Field>
              </div>

              {/* Теги проблем */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Теги проблем</h3>
                {config.problem_tags.length === 0 ? (
                  <p className="text-gray-400 text-sm">Теги проблем не заданы — проблемы по тегам не учитываются.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-200">
                          <th className="py-1.5 pr-4">Имя</th>
                          <th className="py-1.5 pr-4">Операция</th>
                          <th className="py-1.5">Значение</th>
                        </tr>
                      </thead>
                      <tbody>
                        {config.problem_tags.map((pt, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-1.5 pr-4 font-mono text-xs">{pt.tag}</td>
                            <td className="py-1.5 pr-4">{pt.operator_label}</td>
                            <td className="py-1.5">{pt.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Расширенная настройка */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Расширенная настройка</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Field label="Правило распространения состояния">
                      {config.propagation_rule_label}
                      {[1, 2, 4].includes(config.propagation_rule) && (
                        <span className="text-gray-500"> (значение: {statusLabel(config.propagation_value)})</span>
                      )}
                    </Field>
                    <p className="text-xs text-gray-500 mt-1">{PROPAGATION_HINTS[config.propagation_rule]}</p>
                  </div>
                  <Field label="Вес">{config.weight}</Field>
                </div>
              </div>

              {/* Дочерние услуги */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Дочерние услуги ({config.children.length})</h3>
                {config.children.length === 0 ? (
                  <p className="text-gray-400 text-sm">Нет дочерних услуг (лист модели).</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {config.children.map(c => (
                      <button
                        key={c.serviceid}
                        onClick={() => selectService(c.serviceid)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-gray-50 text-left transition"
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: statusColor(c.status) }} />
                        <span className="text-gray-400 font-mono text-xs flex-none">{c.serviceid}</span>
                        <span className="text-sm text-gray-800 truncate">{c.name}</span>
                        {c.status >= 0 && (
                          <span className="ml-auto text-xs flex-none" style={{ color: statusColor(c.status) }}>
                            {statusLabel(c.status)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Теги услуги */}
              {config.tags.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Теги услуги</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {config.tags.map((t, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-gray-100 text-xs font-mono">
                        {t.tag}={t.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center h-64 text-gray-400">
              Выберите услугу в списке слева
            </div>
          )}
        </div>
      </div>
    </div>
  );
}