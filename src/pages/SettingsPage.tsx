import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Users as UsersIcon,
  UsersRound,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime } from '../time';
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

interface LastSync {
  at: string;
  slas: number;
  services: number;
  links: number;
}

interface AccessCounts {
  users: number;
  admins: number;
  groups: number;
}

const LAST_SYNC_KEY = 'sla_last_sync';

/** Прочитать последнюю синхронизацию из localStorage (переживает перезагрузку). */
function readLastSync(): LastSync | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    return raw ? (JSON.parse(raw) as LastSync) : null;
  } catch {
    return null;
  }
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
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<LastSync | null>(readLastSync);
  const [counts, setCounts] = useState<AccessCounts | null>(null);

  useEffect(() => {
    loadStatus();
    if (isAdmin) loadCounts();
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

  /** Сводка по доступам: пользователи / админы / группы. */
  const loadCounts = async () => {
    try {
      const [users, groups] = await Promise.all([api.getUsers(), api.getGroups()]);
      setCounts({
        users: users.length,
        admins: users.filter(u => u.role === 'admin').length,
        groups: groups.length,
      });
    } catch {
      setCounts(null);
    }
  };

  /** Полная синхронизация с Zabbix (SLA → услуги → связи). Только admin. */
  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api.syncFull();
      const info: LastSync = {
        at: formatDateTime(new Date()),
        slas: result.slas,
        services: result.services,
        links: result.links,
      };
      setLastSync(info);
      try {
        localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(info));
      } catch {
        /* localStorage может быть недоступен — не критично */
      }
      showToast(
        'success',
        `Синхронизация завершена: SLA ${result.slas}, услуг ${result.services}`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Ошибка синхронизации');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content">Настройки</h1>
        <p className="text-muted mt-1">Состояние системы, подключение к Zabbix и доступы</p>
      </div>

      {/* Система */}
      <div className="bg-surface rounded-xl shadow-card border border-line p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings className="text-muted" />
          Система
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-line/60">
            <span className="text-muted">Название</span>
            <span className="text-content font-medium">SLA Planner</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-line/60">
            <span className="text-muted">Версия</span>
            <span className="text-content font-mono">{status.version}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-line/60">
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
          <div className="flex items-center justify-between py-2">
            <span className="text-muted">Время</span>
            <span className="text-content">
              Москва (МСК, UTC+3) — <span className="text-faint">одинаково для всех</span>
            </span>
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
            <div className="flex items-center justify-between py-2 border-b border-line/60">
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

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-2 border-b border-line/60">
              <span className="text-muted">API URL</span>
              <span className="text-content font-mono text-xs sm:text-sm break-all text-right">
                {status.zabbixUrl || '—'}
              </span>
            </div>

            <div className="flex items-start justify-between gap-3 py-2">
              <div>
                <p className="text-muted">Режим Read-Only</p>
                <p className="text-xs text-faint mt-0.5">
                  Блокирует любые записи в Zabbix (sla.update)
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium shrink-0 ${
                  status.readOnly ? 'bg-warn-soft text-warn-fg' : 'bg-ok-soft text-ok-fg'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {status.readOnly ? 'Read-Only' : 'Read-Write'}
              </span>
            </div>

            {status.readOnly && (
              <div className="p-3 bg-warn-soft border border-warn-line rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warn-fg mt-0.5 shrink-0" />
                <p className="text-xs text-warn-fg leading-relaxed">
                  <strong>Внимание:</strong> В режиме Read-Only портал не может создавать
                  исключения простоя в Zabbix. Единственный пишущий метод —{' '}
                  <span className="font-mono">sla.update</span> — заблокирован.
                </p>
              </div>
            )}

            {/* Синхронизация */}
            <div className="pt-4 mt-1 border-t border-line/60">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-content font-medium">Синхронизация данных</p>
                  <p className="text-xs text-faint mt-0.5">
                    Забрать из Zabbix актуальные SLA, услуги и связи между ними
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  loading={syncing}
                  onClick={handleSync}
                >
                  {syncing ? 'Синхронизация…' : 'Синхронизировать'}
                </Button>
              </div>

              {lastSync ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-ok-fg" />
                    Последняя: {lastSync.at}
                  </span>
                  <span className="text-faint">
                    SLA {lastSync.slas} · услуг {lastSync.services} · связей {lastSync.links}
                  </span>
                </div>
              ) : (
                <p className="mt-3 text-xs text-faint">
                  В этой сессии синхронизация ещё не запускалась.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Доступы */}
      {isAdmin && (
        <div className="bg-surface rounded-xl shadow-card border border-line p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <UsersRound className="text-muted" />
            Доступы
            <span className="text-xs font-normal text-faint">
              настраиваются в разделах «Пользователи» и «Группы»
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-line bg-surface-2/50 p-4">
              <div className="flex items-center gap-2 text-muted text-xs">
                <UsersIcon className="w-3.5 h-3.5" />
                Пользователи
              </div>
              <div className="mt-1 text-2xl font-semibold text-content">
                {counts ? counts.users : '—'}
              </div>
              <div className="text-xs text-faint mt-0.5">
                {counts ? `из них админов: ${counts.admins}` : 'нет данных'}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface-2/50 p-4">
              <div className="flex items-center gap-2 text-muted text-xs">
                <UsersRound className="w-3.5 h-3.5" />
                Группы
              </div>
              <div className="mt-1 text-2xl font-semibold text-content">
                {counts ? counts.groups : '—'}
              </div>
              <div className="text-xs text-faint mt-0.5">команды с правами</div>
            </div>
            <div className="rounded-lg border border-line bg-surface-2/50 p-4">
              <div className="flex items-center gap-2 text-muted text-xs">
                <Database className="w-3.5 h-3.5" />
                Модель прав
              </div>
              <div className="mt-1 text-sm font-medium text-content">Роли + группы</div>
              <div className="text-xs text-faint mt-0.5">
                admin — все права; user — сумма прав групп
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
