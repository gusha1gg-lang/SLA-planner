import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarCheck, Clock, Loader2, Percent, Server, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { SLA, Service, PlannedWork } from '../types';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../time';

interface DashboardPageProps {
  onNavigate: (page: string, params?: Record<string, string>) => void;
}

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { showToast } = useToast();
  const [slas, setSlas] = useState<SLA[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [works, setWorks] = useState<PlannedWork[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [s, svc, w] = await Promise.all([
        api.getSLAs(),
        api.getServices(),
        api.getPlannedWorks(),
      ]);
      setSlas(s);
      setServices(svc);
      setWorks(w);
    } finally {
      setLoading(false);
    }
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-surface-2 text-content',
    planned: 'bg-accent-soft text-accent',
    active: 'bg-warn-soft text-warn-fg',
    done: 'bg-ok-soft text-ok-fg',
    cancelled: 'bg-surface-2 text-muted',
    sync_error: 'bg-danger-soft text-danger-fg',
  };

  const statusLabels: Record<string, string> = {
    draft: 'Черновик',
    planned: 'Запланировано',
    active: 'Активно',
    done: 'Завершено',
    cancelled: 'Отменено',
    sync_error: 'Ошибка отправки',
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="text-3xl text-accent animate-spin" /></div>;
  }

  // «Последние» работы: на дашборде показываем только свежие, чтобы таблица не разрасталась.
  const recentWorks = works.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content">Дашборд</h1>
        <p className="text-muted mt-1">Обзор системы SLA Planner</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 stagger">
        <div className="bg-surface rounded-xl p-5 shadow-card border border-line">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-soft flex items-center justify-center">
              <ShieldCheck className="text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold">{slas.length}</p>
              <p className="text-sm text-muted">SLA</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 shadow-card border border-line">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-tag-soft flex items-center justify-center">
              <Server className="text-tag-fg" />
            </div>
            <div>
              <p className="text-2xl font-bold">{services.length}</p>
              <p className="text-sm text-muted">Услуг</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 shadow-card border border-line">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-ok-soft flex items-center justify-center">
              <CalendarCheck className="text-ok-fg" />
            </div>
            <div>
              <p className="text-2xl font-bold">{works.filter(w => w.status === 'planned').length}</p>
              <p className="text-sm text-muted">Запланировано</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 shadow-card border border-line">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warn-soft flex items-center justify-center">
              <AlertTriangle className="text-warn-fg" />
            </div>
            <div>
              <p className="text-2xl font-bold">{works.filter(w => w.status === 'sync_error').length}</p>
              <p className="text-sm text-muted">Ошибки</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent works */}
      <div className="bg-surface rounded-xl shadow-card border border-line">
        <div className="p-5 border-b border-line flex items-center justify-between">
          <h2 className="text-lg font-semibold">Последние плановые работы</h2>
          <button
            onClick={() => onNavigate('works')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent transition-colors"
          >
            Все работы
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-muted">Название</th>
                <th className="text-left px-5 py-3 font-medium text-muted">SLA</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Услуга</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Период</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recentWorks.map(work => (
                <tr key={work.id} className="hover:bg-surface-2">
                  <td className="px-5 py-3 font-medium">{work.title}</td>
                  <td className="px-5 py-3 text-muted">{work.sla_name}</td>
                  <td className="px-5 py-3 text-muted">{work.service_name}</td>
                  <td className="px-5 py-3 text-muted">
                    {formatDate(work.started_at)} — {formatDate(work.ended_at)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[work.status]}`}>
                      {statusLabels[work.status]}
                    </span>
                  </td>
                </tr>
              ))}
              {recentWorks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-faint">Плановых работ пока нет</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SLA list */}
      <div className="bg-surface rounded-xl shadow-card border border-line">
        <div className="p-5 border-b border-line">
          <h2 className="text-lg font-semibold">SLA-объекты</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 stagger">
          {slas.map(sla => (
            <div key={sla.id} onClick={() => onNavigate('sla-detail', { id: sla.zabbix_slaid })}
              className="border border-line rounded-lg p-4 cursor-pointer transition-all duration-200 ease-standard hover:-translate-y-0.5 hover:border-accent-line hover:shadow-card-hover">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-content">{sla.name}</h3>
                <span className="text-xs bg-surface-2 text-muted px-2 py-1 rounded">ID: {sla.zabbix_slaid}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted">
                <span><Percent className="mr-1" />SLO: {sla.slo}%</span>
                <span><Clock className="mr-1" />{sla.schedule_type}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
