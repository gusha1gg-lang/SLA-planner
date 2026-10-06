import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface StatusBarProps {
  onSync?: () => void;
}

export default function StatusBar({ onSync }: StatusBarProps) {
  const { hasRole } = useAuth();
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
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const health = await api.health();
      setStatus(prev => ({
        ...prev,
        backend: 'ok',
        version: health.version || '0.1.0',
        // In mock mode, we assume Zabbix is disconnected
        zabbix: 'disconnected',
        readOnly: true,
      }));
    } catch {
      setStatus(prev => ({ ...prev, backend: 'error' }));
    }
  };

  const handleSync = async () => {
    if (!hasRole(['admin'])) return;
    setSyncing(true);
    try {
      await api.syncSLAsFromZabbix();
      await api.syncServicesFromZabbix();
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
        {/* Backend status */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${
            status.backend === 'ok' ? 'bg-green-500' :
            status.backend === 'loading' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
          }`}></span>
          <span className="text-gray-600">
            Backend: {status.backend === 'ok' ? 'Online' : status.backend === 'loading' ? '...' : 'Offline'}
          </span>
        </div>

        {/* Zabbix status */}
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

        {/* Read-only badge */}
        {status.readOnly && (
          <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
            <i className="fas fa-lock text-[10px]"></i>
            Read-Only
          </span>
        )}

        {/* Version */}
        <span className="text-gray-400">v{status.version}</span>
      </div>

      <div className="flex items-center gap-3">
        {lastSync && (
          <span className="text-gray-400">
            Последняя синхр.: {lastSync}
          </span>
        )}
        
        {hasRole(['admin']) && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition disabled:opacity-50"
          >
            <i className={`fas fa-sync-alt ${syncing ? 'animate-spin' : ''}`}></i>
            {syncing ? 'Синхронизация...' : 'Синхр. с Zabbix'}
          </button>
        )}
      </div>
    </div>
  );
}
