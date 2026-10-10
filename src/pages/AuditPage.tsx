import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AuditLogEntry } from '../types';
import { formatDateTime } from '../time';

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

  const actionIcons: Record<string, string> = {
    create: 'fa-plus text-green-600',
    update: 'fa-edit text-blue-600',
    delete: 'fa-trash text-red-600',
    sync: 'fa-sync text-purple-600',
    login: 'fa-sign-in-alt text-gray-600',
  };

  const filteredLogs = filter
    ? logs.filter(l => l.action.includes(filter) || l.entity_type.includes(filter) || l.username.includes(filter))
    : logs;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-blue-600"></i></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Аудит-лог</h1>
        <p className="text-gray-500 mt-1">История действий пользователей в системе</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Фильтр по действию, типу, пользователю..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <span className="text-sm text-gray-500">{filteredLogs.length} записей</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-12"></th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Время</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Пользователь</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Действие</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Объект</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Результат</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Детали</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredLogs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <i className={`fas ${actionIcons[log.action] || 'fa-circle text-gray-400'}`}></i>
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {formatDateTime(log.created_at)}
                </td>
                <td className="px-4 py-3 font-medium">{log.username}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">{log.action}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <span className="font-mono text-xs">{log.entity_type}</span>
                  {log.entity_id > 0 && <span className="text-gray-400 ml-1">#{log.entity_id}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    log.result === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {log.result === 'ok' ? 'OK' : 'ERROR'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <details className="text-xs">
                    <summary className="cursor-pointer text-blue-600 hover:text-blue-800">JSON</summary>
                    <pre className="mt-1 bg-gray-50 p-2 rounded text-xs overflow-x-auto max-w-xs">
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
