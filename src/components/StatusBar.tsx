import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface StatusBarProps {
  onSync?: () => void;
}

/**
 * Строка состояния.
 *
 * Обычные пользователи видят только состояние сервера — портал должен выглядеть
 * как самостоятельное приложение, без следов интеграции с Zabbix. Состояние
 * Zabbix, режим Read-Only и кнопка синхронизации показываются только admin.
 */
export default function StatusBar({ onSync }: StatusBarProps) {
  const { token, isAdmin } = useAuth();
  const [status, setStatus] = useState<{
    backend: 'ok' | 'error' | 'loading';
    zabbix: 'connected' | 'disconnected' | 'unknown';
    readOnly: boolean;
    version: string;
  }>({
    backend: 'loading',
    zabbix: 'unknown',
    readOnly: true,
    version: '...',
  });
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [token, isAdmin]);

  const checkStatus = async () => {
    try {
      const health = await api.health();
      setStatus(prev => ({
        ...prev,
        backend: 'ok',
        version: health.version || '0.1.0',
      }));

      // Состояние Zabbix запрашиваем только для admin — остальным оно не нужно.
      if (token && isAdmin) {
        try {
          const response = await fetch('/api/zabbix/status');
          if (response.ok) {
            const zabbixData = await response.json();
            setStatus(prev => ({
              ...prev,
              zabbix: zabbixData.connected ? 'connected' : 'disconnected',
              readOnly: zabbixData.read_only,
            }));
          }
        } catch {
          setStatus(prev => ({ ...prev, zabbix: 'unknown' }));
        }
      }
    } catch {
      setStatus(prev => ({ ...prev, backend: 'error' }));
    }
  };

  const handleSync = async () => {
    if (!isAdmin) return;
    setSyncing(true);
    try {
      await api.syncFull();
      setLastSync(new Date().toLocaleTimeString('ru-RU'));
      onSync?.();
    } catch (err) {
      console.error('Sync failed:', err);
    }
    setSyncing(false);
  };

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center justify-between text-xs">
      <div className="flex items-center gap-4">
        {/* Статус сервера — виден всем */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${
            status.backend === 'ok' ? 'bg-green-500' :
            status.backend === 'loading' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
          }`}></span>
          <span className="text-gray-600">
            Сервер: {status.backend === 'ok' ? 'Online' : status.backend === 'loading' ? '...' : 'Offline'}
          </span>
        </div>

        {/* Состояние интеграции — только admin */}
        {isAdmin && (
          <>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${
                status.zabbix === 'connected' ? 'bg-green-500' :
                status.zabbix === 'unknown' ? 'bg-gray-400' :
                'bg-red-400'
              }`}></span>
              <span className="text-gray-600">
                Zabbix: {status.zabbix === 'connected' ? 'Подключен' : status.zabbix === 'unknown' ? '—' : 'Не подключен'}
              </span>
            </div>

            {status.readOnly && (
              <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                <i className="fas fa-lock text-[10px]"></i>
                Read-Only
              </span>
            )}
          </>
        )}

        <span className="text-gray-400">v{status.version}</span>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="text-gray-400">
              Последняя синхр.: {lastSync}
            </span>
          )}

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition disabled:opacity-50"
          >
            <i className={`fas fa-sync-alt ${syncing ? 'animate-spin' : ''}`}></i>
            {syncing ? 'Синхронизация...' : 'Синхр. с Zabbix'}
          </button>
        </div>
      )}
    </div>
  );
}
