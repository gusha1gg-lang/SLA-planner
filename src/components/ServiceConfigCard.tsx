import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { ServiceConfig } from '../types';
import { formatDateTime } from '../time';

/**
 * Карточка живой конфигурации услуги из Zabbix (GET /api/services/{id}/config).
 * Используется на странице «Услуги» (справа от списка) и на «Модели здоровья»
 * (панель под графом при клике на узел услуги). Сама управляет своей загрузкой.
 */

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

export function statusColor(status: number): string {
  return STATUS_COLORS[status] ?? '#A9A9A9';
}

export function statusLabel(status: number): string {
  return STATUS_LABELS[status] ?? String(status);
}

function formatDate(iso: string | null): string {
  return formatDateTime(iso);
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

interface ServiceConfigCardProps {
  /** zabbix_serviceid услуги. */
  serviceId: string;
  /** Кнопка-крестик в шапке (для панели на «Модели здоровья»). */
  onClose?: () => void;
  /** Клик по родителю/ребёнку — передать выбор наружу (переключить услугу). */
  onSelectService?: (zabbixServiceId: string) => void;
}

export default function ServiceConfigCard({ serviceId, onClose, onSelectService }: ServiceConfigCardProps) {
  const [config, setConfig] = useState<ServiceConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.getServiceConfig(serviceId)
      .then(c => { if (!cancelled) setConfig(c); })
      .catch(e => {
        if (!cancelled) {
          setConfig(null);
          setError(e.message || 'Не удалось загрузить конфигурацию услуги');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [serviceId]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center h-64">
        <span className="flex items-center gap-2 text-gray-500 text-sm">
          <i className="fas fa-spinner fa-spin text-xl text-blue-600"></i>
          Загрузка конфигурации…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">
        <i className="fas fa-exclamation-triangle mr-2"></i>{error}
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
      {/* Заголовок */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{config.name}</h2>
          <p className="text-gray-400 font-mono text-xs mt-0.5">
            id={config.serviceid}
            {config.readonly && <span className="ml-3 text-amber-600"><i className="fas fa-lock mr-1"></i>только чтение</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="px-2.5 py-1 rounded-full text-xs font-semibold text-white flex-none"
            style={{ background: statusColor(config.status) }}
          >
            {config.status_label}
          </span>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Закрыть">
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
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
                  onClick={() => onSelectService?.(p.serviceid)}
                  disabled={!onSelectService}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-xs transition disabled:hover:bg-gray-100 disabled:hover:text-gray-800 disabled:cursor-default"
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
          <Field label="Правило вычисления состояния">{config.algorithm_label}</Field>
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
                onClick={() => onSelectService?.(c.serviceid)}
                disabled={!onSelectService}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-gray-50 text-left transition disabled:hover:bg-white disabled:cursor-default"
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
  );
}