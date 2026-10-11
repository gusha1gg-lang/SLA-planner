import React, { useEffect, useState } from 'react';
import { Loader2, Search, Plus, Pencil, Trash2, RefreshCw, LogIn, Circle, type LucideIcon } from 'lucide-react';
import { api } from '../api/client';
import { AuditLogEntry } from '../types';
import { formatDateTime } from '../time';

/** Иконка действия в аудит-логе (действие → иконка + цвет). */
const ACTION_ICONS: Record<string, { Icon: LucideIcon; cls: string }> = {
  create: { Icon: Plus, cls: 'text-ok-fg' },
  update: { Icon: Pencil, cls: 'text-accent' },
  delete: { Icon: Trash2, cls: 'text-danger-fg' },
  sync: { Icon: RefreshCw, cls: 'text-tag-fg' },
  login: { Icon: LogIn, cls: 'text-muted' },
};

function ActionIcon({ action }: { action: string }) {
  const entry = ACTION_ICONS[action];
  const Icon = entry?.Icon ?? Circle;
  return <Icon className={entry?.cls ?? 'text-faint'} />;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const data = await api.getAuditLogs();
      setLogs(data);
    } finally { setLoading(false); }
  };

  const filteredLogs = filter
    ? logs.filter(l => l.action.includes(filter) || l.entity_type.includes(filter) || l.username.includes(filter))
    : logs;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="text-3xl text-accent animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-content">Аудит-лог</h1>
        <p className="text-muted mt-1">История действий пользователей в системе</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Фильтр по действию, типу, пользователю..."
            className="w-full pl-9 pr-4 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          />
        </div>
        <span className="text-sm text-muted">{filteredLogs.length} записей</span>
      </div>

      <div className="bg-surface rounded-xl shadow-card border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted w-12"></th>
              <th className="text-left px-4 py-3 font-medium text-muted">Время</th>
              <th className="text-left px-4 py-3 font-medium text-muted">Пользователь</th>
              <th className="text-left px-4 py-3 font-medium text-muted">Действие</th>
              <th className="text-left px-4 py-3 font-medium text-muted">Объект</th>
              <th className="text-left px-4 py-3 font-medium text-muted">Результат</th>
              <th className="text-left px-4 py-3 font-medium text-muted">Детали</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredLogs.map(log => (
              <tr key={log.id} className="hover:bg-surface-2">
                <td className="px-4 py-3">
                  <ActionIcon action={log.action} />
                </td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">
                  {formatDateTime(log.created_at)}
                </td>
                <td className="px-4 py-3 font-medium">{log.username}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 bg-surface-2 rounded text-xs font-mono">{log.action}</span>
                </td>
                <td className="px-4 py-3 text-muted">
                  <span className="font-mono text-xs">{log.entity_type}</span>
                  {log.entity_id > 0 && <span className="text-faint ml-1">#{log.entity_id}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    log.result === 'ok' ? 'bg-ok-soft text-ok-fg' : 'bg-danger-soft text-danger-fg'
                  }`}>
                    {log.result === 'ok' ? 'OK' : 'ERROR'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <details className="text-xs">
                    <summary className="cursor-pointer text-accent hover:text-accent">JSON</summary>
                    <pre className="mt-1 bg-surface-2 p-2 rounded text-xs overflow-x-auto max-w-xs">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
