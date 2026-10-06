import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { SLA, PlannedWork } from '../types';

export default function ReportPage() {
  const [slas, setSlas] = useState<SLA[]>([]);
  const [works, setWorks] = useState<PlannedWork[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [s, w] = await Promise.all([api.getSLAs(), api.getPlannedWorks()]);
      setSlas(s); setWorks(w);
    } finally { setLoading(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-blue-600"></i></div>;
  }

  const totalWorks = works.length;
  const doneWorks = works.filter(w => w.status === 'done').length;
  const plannedWorks = works.filter(w => w.status === 'planned').length;
  const totalDowntimeHours = works.reduce((acc, w) => {
    const start = new Date(w.started_at).getTime();
    const end = new Date(w.ended_at).getTime();
    return acc + (end - start) / (1000 * 60 * 60);
  }, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SLA-отчёт</h1>
        <p className="text-gray-500 mt-1">Статистика доступности и исключений простоя</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Всего работ</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalWorks}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Завершено</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{doneWorks}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Запланировано</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{plannedWorks}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Общее время простоя</p>
          <p className="text-3xl font-bold text-orange-600 mt-1">{totalDowntimeHours.toFixed(1)}ч</p>
        </div>
      </div>

      {/* Per-SLA report */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold">Отчёт по SLA</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-500">SLA</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">SLO</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Работ</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Завершено</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Простой (ч)</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Исключений</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {slas.map(sla => {
                const slaWorks = works.filter(w => w.sla_id === sla.id);
                const slaDone = slaWorks.filter(w => w.status === 'done');
                const slaDowntime = slaWorks.reduce((acc, w) => {
                  const start = new Date(w.started_at).getTime();
                  const end = new Date(w.ended_at).getTime();
                  return acc + (end - start) / (1000 * 60 * 60);
                }, 0);
                return (
                  <tr key={sla.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">{sla.name}</td>
                    <td className="px-5 py-3">
                      <span className="text-green-600 font-medium">{sla.slo}%</span>
                    </td>
                    <td className="px-5 py-3">{slaWorks.length}</td>
                    <td className="px-5 py-3 text-green-600">{slaDone.length}</td>
                    <td className="px-5 py-3">{slaDowntime.toFixed(1)}</td>
                    <td className="px-5 py-3">
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        {slaWorks.filter(w => w.status === 'planned' || w.status === 'done').length}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual bars */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-semibold mb-4">Визуализация простоя по SLA</h2>
        <div className="space-y-4">
          {slas.map(sla => {
            const slaWorks = works.filter(w => w.sla_id === sla.id);
            const slaDowntime = slaWorks.reduce((acc, w) => {
              const start = new Date(w.started_at).getTime();
              const end = new Date(w.ended_at).getTime();
              return acc + (end - start) / (1000 * 60 * 60);
            }, 0);
            const maxHours = 24;
            const pct = Math.min((slaDowntime / maxHours) * 100, 100);
            return (
              <div key={sla.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{sla.name}</span>
                  <span className="text-gray-500">{slaDowntime.toFixed(1)}ч / {maxHours}ч макс</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div className={`h-3 rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${pct}%` }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
