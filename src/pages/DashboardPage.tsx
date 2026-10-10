import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { SLA, Service, PlannedWork } from '../types';
import { useToast } from '../context/ToastContext';

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
    draft: 'bg-gray-100 text-gray-700',
    planned: 'bg-blue-100 text-blue-700',
    active: 'bg-yellow-100 text-yellow-700',
    done: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
    sync_error: 'bg-red-100 text-red-700',
  };

  const statusLabels: Record<string, string> = {
    draft: 'Черновик',
    planned: 'Запланировано',
    active: 'Активно',
    done: 'Завершено',
    cancelled: 'Отменено',
    sync_error: 'Ошибка синхр.',
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-blue-600"></i></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
        <p className="text-gray-500 mt-1">Обзор системы SLA Planner</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <i className="fas fa-shield-alt text-blue-600"></i>
            </div>
            <div>
              <p className="text-2xl font-bold">{slas.length}</p>
              <p className="text-sm text-gray-500">SLA</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <i className="fas fa-server text-purple-600"></i>
            </div>
            <div>
              <p className="text-2xl font-bold">{services.length}</p>
              <p className="text-sm text-gray-500">Услуг</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <i className="fas fa-calendar-check text-green-600"></i>
            </div>
            <div>
              <p className="text-2xl font-bold">{works.filter(w => w.status === 'planned').length}</p>
              <p className="text-sm text-gray-500">Запланировано</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <i className="fas fa-exclamation-triangle text-yellow-600"></i>
            </div>
            <div>
              <p className="text-2xl font-bold">{works.filter(w => w.status === 'sync_error').length}</p>
              <p className="text-sm text-gray-500">Ошибки</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent works */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold">Последние плановые работы</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Название</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">SLA</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Услуга</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Период</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {works.map(work => (
                <tr key={work.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium">{work.title}</td>
                  <td className="px-5 py-3 text-gray-600">{work.sla_name}</td>
                  <td className="px-5 py-3 text-gray-600">{work.service_name}</td>
                  <td className="px-5 py-3 text-gray-600">
                    {new Date(work.started_at).toLocaleDateString('ru-RU')} — {new Date(work.ended_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[work.status]}`}>
                      {statusLabels[work.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SLA list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold">SLA-объекты</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
          {slas.map(sla => (
            <div key={sla.id} onClick={() => onNavigate('sla-detail', { id: sla.zabbix_slaid })}
              className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{sla.name}</h3>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">ID: {sla.zabbix_slaid}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span><i className="fas fa-percentage mr-1"></i>SLO: {sla.slo}%</span>
                <span><i className="fas fa-clock mr-1"></i>{sla.schedule_type}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
