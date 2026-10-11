import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Server, Settings, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';

type BackendStatus = 'ok' | 'error' | 'loading';
type ZabbixStatus = 'connected' | 'disconnected' | 'unknown';

interface SystemStatus {
  backend: BackendStatus;
  version: string;
  zabbix: ZabbixStatus;
  readOnly: boolean;
  zabbixUrl: string;
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const [status, setStatus] = useState<SystemStatus>({
    backend: 'loading',
    version: '...',
    zabbix: 'unknown',
    readOnly: true,
    zabbixUrl: '',
  });
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();
  }, [isAdmin]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const health = await api.health();
      setStatus(prev => ({
        ...prev,
        backend: 'ok',
        version: health.version || '0.1.0',
      }));

      if (isAdmin) {
        try {
          const res = await fetch('/api/zabbix/status');
          if (res.ok) {
            const data = await res.json();
            setStatus(prev => ({
              ...prev,
              zabbix: data.connected ? 'connected' : 'disconnected',
              readOnly: Boolean(data.read_only),
              zabbixUrl: data.api_url || '',
            }));
          } else {
            setStatus(prev => ({ ...prev, zabbix: 'disconnected' }));
          }
        } catch {
          setStatus(prev => ({ ...prev, zabbix: 'unknown' }));
        }
      }
    } catch {
      setStatus(prev => ({ ...prev, backend: 'error' }));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    setSaved(true);
    showToast('success', 'Настройки сохранены');
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content">Настройки</h1>
        <p className="text-muted mt-1">
          Системные параметры и состояние подключения к Zabbix
        </p>
      </div>

      {saved && (
        <div className="bg-ok-soft border border-ok-line text-ok-fg px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Настройки сохранены
        </div>
      )}

      {/* Система */}
      <div className="bg-surface rounded-xl shadow-card border border-line p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings className="text-muted" />
          Система
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-line/60 last:border-0">
            <span className="text-muted">Название</span>
            <span className="text-content font-medium">SLA Planner</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-line/60 last:border-0">
            <span className="text-muted">Версия</span>
            <span className="text-content font-mono">{status.version}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-line/60 last:border-0">
            <span className="text-muted">Статус бэкенда</span>
            {loading ? (
              <span className="flex items-center gap-1.5 text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                Проверка...
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium ${
                  status.backend === 'ok'
                    ? 'bg-ok-soft text-ok-fg'
                    : 'bg-danger-soft text-danger-fg'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    status.backend === 'ok' ? 'bg-ok-fg' : 'bg-danger-fg'
                  }`}
                />
                {status.backend === 'ok' ? 'Online' : 'Offline'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Zabbix */}
      {isAdmin && (
        <div className="bg-surface rounded-xl shadow-card border border-line p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Server className="text-accent" />
            Zabbix
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-line/60 last:border-0">
              <span className="text-muted">Подключение</span>
              {loading ? (
                <span className="flex items-center gap-1.5 text-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Проверка...
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium ${
                    status.zabbix === 'connected'
                      ? 'bg-ok-soft text-ok-fg'
                      : status.zabbix === 'unknown'
                      ? 'bg-surface-2 text-muted'
                      : 'bg-danger-soft text-danger-fg'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      status.zabbix === 'connected'
                        ? 'bg-ok-fg'
                        : status.zabbix === 'unknown'
                        ? 'bg-faint'
                        : 'bg-danger-fg'
                    }`}
                  />
                  {status.zabbix === 'connected'
                    ? 'Подключён'
                    : status.zabbix === 'unknown'
                    ? 'Не определено'
                    : 'Не подключён'}
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-2 border-b border-line/60 last:border-0">
              <span className="text-muted">API URL</span>
              <span className="text-content font-mono text-xs sm:text-sm break-all text-right">
                {status.zabbixUrl || '—'}
              </span>
            </div>

            <div className="flex items-start justify-between gap-3 py-2 border-b border-line/60 last:border-0">
              <div>
                <p className="text-muted">Режим Read-Only</p>
                <p className="text-xs text-faint mt-0.5">
                  Блокирует любые записи в Zabbix (sla.update)
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium shrink-0 ${
                  status.readOnly
                    ? 'bg-warn-soft text-warn-fg'
                    : 'bg-ok-soft text-ok-fg'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {status.readOnly ? 'Read-Only' : 'Read-Write'}
              </span>
            </div>

            {status.readOnly && (
              <div className="mt-3 p-3 bg-warn-soft border border-warn-line rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warn-fg mt-0.5 shrink-0" />
                <p className="text-xs text-warn-fg leading-relaxed">
                  <strong>Внимание:</strong> В режиме Read-Only портал не может
                  создавать исключения простоя в Zabbix. Единственный пишущий
                  метод — <span className="font-mono">sla.update</span> —
                  заблокирован.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Общие */}
      <div className="bg-surface rounded-xl shadow-card border border-line p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings className="text-muted" />
          Общие
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content mb-1">
              Часовой пояс
            </label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-brand-500 outline-none bg-surface"
            >
              <option value="Europe/Moscow">Europe/Moscow (UTC+3)</option>
              <option value="UTC">UTC</option>
              <option value="Asia/Yekaterinburg">Asia/Yekaterinburg (UTC+5)</option>
              <option value="Asia/Novosibirsk">Asia/Novosibirsk (UTC+7)</option>
            </select>
            <p className="text-xs text-faint mt-1">
              Используется для отображения дат и времени в интерфейсе
            </p>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <Button onClick={handleSave}>Сохранить настройки</Button>
        </div>
      </div>
    </div>
  );
}
