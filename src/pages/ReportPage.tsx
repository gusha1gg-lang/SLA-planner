import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { SLA, PlannedWork } from '../types';
import { useToast } from '../context/ToastContext';
import { mskDateKey } from '../time';
import Button from '../components/ui/Button';

export default function ReportPage() {
  const { showToast } = useToast();
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

  const exportToCSV = () => {
    const headers = ['SLA', 'SLO', 'Работ', 'Завершено', 'Простой (ч)', 'Исключений'];
    const rows = slas.map(sla => {
      const slaWorks = works.filter(w => w.sla_id === sla.id);
      const slaDone = slaWorks.filter(w => w.status === 'done');
      const slaDowntime = slaWorks.reduce((acc, w) => {
        const start = new Date(w.started_at).getTime();
        const end = new Date(w.ended_at).getTime();
        return acc + (end - start) / (1000 * 60 * 60);
      }, 0);
      const excluded = slaWorks.filter(w => w.status === 'planned' || w.status === 'done').length;
      return [sla.name, sla.slo, slaWorks.length, slaDone.length, slaDowntime.toFixed(1), excluded];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sla-report-${mskDateKey(new Date())}.csv`;
    link.click();
    
    showToast('success', 'Отчёт экспортирован в CSV');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="text-3xl text-accent animate-spin" /></div>;
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content">SLA-отчёт</h1>
          <p className="text-muted mt-1">Статистика доступности и исключений простоя</p>
        </div>
        <Button variant="success" icon={FileSpreadsheet} onClick={exportToCSV}>
          Экспорт CSV
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 stagger">
        <div className="bg-surface rounded-xl p-5 shadow-card border border-line">
          <p className="text-sm text-muted">Всего работ</p>
          <p className="text-3xl font-bold text-content mt-1">{totalWorks}</p>
        </div>
        <div className="bg-surface rounded-xl p-5 shadow-card border border-line">
          <p className="text-sm text-muted">Завершено</p>
          <p className="text-3xl font-bold text-ok-fg mt-1">{doneWorks}</p>
        </div>
        <div className="bg-surface rounded-xl p-5 shadow-card border border-line">
          <p className="text-sm text-muted">Запланировано</p>
          <p className="text-3xl font-bold text-accent mt-1">{plannedWorks}</p>
        </div>
        <div className="bg-surface rounded-xl p-5 shadow-card border border-line">
          <p className="text-sm text-muted">Общее время простоя</p>
          <p className="text-3xl font-bold text-warn-fg mt-1">{totalDowntimeHours.toFixed(1)}ч</p>
        </div>
      </div>

      {/* Per-SLA report */}
      <div className="bg-surface rounded-xl shadow-card border border-line">
        <div className="p-5 border-b border-line">
          <h2 className="text-lg font-semibold">Отчёт по SLA</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-muted">SLA</th>
                <th className="text-left px-5 py-3 font-medium text-muted">SLO</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Работ</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Завершено</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Простой (ч)</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Исключений</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {slas.map(sla => {
                const slaWorks = works.filter(w => w.sla_id === sla.id);
                const slaDone = slaWorks.filter(w => w.status === 'done');
                const slaDowntime = slaWorks.reduce((acc, w) => {
                  const start = new Date(w.started_at).getTime();
                  const end = new Date(w.ended_at).getTime();
                  return acc + (end - start) / (1000 * 60 * 60);
                }, 0);
                return (
                  <tr key={sla.id} className="hover:bg-surface-2">
                    <td className="px-5 py-3 font-medium">{sla.name}</td>
                    <td className="px-5 py-3">
                      <span className="text-ok-fg font-medium">{sla.slo}%</span>
                    </td>
                    <td className="px-5 py-3">{slaWorks.length}</td>
                    <td className="px-5 py-3 text-ok-fg">{slaDone.length}</td>
                    <td className="px-5 py-3">{slaDowntime.toFixed(1)}</td>
                    <td className="px-5 py-3">
                      <span className="bg-accent-soft text-accent px-2 py-0.5 rounded-full text-xs font-medium">
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
      <div className="bg-surface rounded-xl shadow-card border border-line p-5">
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
                  <span className="font-medium text-content">{sla.name}</span>
                  <span className="text-muted">{slaDowntime.toFixed(1)}ч / {maxHours}ч макс</span>
                </div>
                <div className="w-full bg-surface-2 rounded-full h-3">
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
