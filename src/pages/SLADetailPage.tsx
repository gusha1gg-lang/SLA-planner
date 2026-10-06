import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { SLA, Service, ExcludedDowntime } from '../types';
import { useAuth } from '../context/AuthContext';

interface SLADetailPageProps {
  slaId: string;
  onBack: () => void;
}

export default function SLADetailPage({ slaId, onBack }: SLADetailPageProps) {
  const { hasRole } = useAuth();
  const [sla, setSla] = useState<SLA | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [excludedDowntimes, setExcludedDowntimes] = useState<ExcludedDowntime[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (slaId) loadData();
  }, [slaId]);

  const loadData = async () => {
    try {
      const slas = await api.getSLAs();
      const currentSla = slas.find(s => s.zabbix_slaid === slaId);
      if (!currentSla) {
        onBack();
        return;
      }
      setSla(currentSla);

      const allServices = await api.getServices();
      // Фильтруем услуги, связанные с этим SLA (через теги)
      const relatedServices = allServices.filter(svc => {
        return svc.tags.some(tag => 
          tag.tag === 'service' && 
          currentSla.service_tags?.includes(tag.value)
        );
      });
      setServices(relatedServices);

      // Mock excluded downtimes (в реальности — из Zabbix через sla.get)
      setExcludedDowntimes([
        { name: 'SLA Planner #1', period_from: '1710540000', period_to: '1710554400' },
        { name: 'SLA Planner #2', period_from: '1712012400', period_to: '1712034000' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatUnixTime = (unix: string) => {
    return new Date(parseInt(unix) * 1000).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateDuration = (from: string, to: string) => {
    const diff = parseInt(to) - parseInt(from);
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    return `${hours}ч ${minutes}мин`;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-blue-600"></i></div>;
  }

  if (!sla) {
    return <div className="text-center py-12 text-gray-500">SLA не найден</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 mb-2">
            <i className="fas fa-arrow-left mr-2"></i>Назад
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{sla.name}</h1>
          <p className="text-gray-500 mt-1">Zabbix SLA ID: {sla.zabbix_slaid}</p>
        </div>
        {hasRole(['admin', 'planner']) && (
          <button onClick={() => setShowAddForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <i className="fas fa-plus mr-2"></i>Добавить исключение
          </button>
        )}
      </div>

      {/* SLA Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">SLO</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{sla.slo}%</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Расписание</p>
          <p className="text-xl font-semibold mt-1">{sla.schedule_type}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Связанных услуг</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{services.length}</p>
        </div>
      </div>

      {/* Excluded Downtimes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold">Исключения простоя (Excluded Downtimes)</h2>
          <p className="text-sm text-gray-500 mt-1">
            Окна планового простоя, которые не учитываются в SLA-отчётности
          </p>
        </div>
        
        {excludedDowntimes.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <i className="fas fa-calendar-times text-4xl mb-3"></i>
            <p>Нет исключений простоя</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Название</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Начало</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Окончание</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Длительность</th>
                  {hasRole(['admin']) && (
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Действия</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {excludedDowntimes.map((dt, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium">{dt.name}</td>
                    <td className="px-5 py-3 text-gray-600">{formatUnixTime(dt.period_from)}</td>
                    <td className="px-5 py-3 text-gray-600">{formatUnixTime(dt.period_to)}</td>
                    <td className="px-5 py-3 text-gray-600">{calculateDuration(dt.period_from, dt.period_to)}</td>
                    {hasRole(['admin']) && (
                      <td className="px-5 py-3">
                        <button className="text-red-500 hover:text-red-700" title="Удалить">
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Related Services */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold">Связанные услуги</h2>
          <p className="text-sm text-gray-500 mt-1">Услуги, привязанные к этому SLA через теги</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {services.map(svc => (
              <div key={svc.id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{svc.name}</p>
                  <p className="text-xs text-gray-500">Zabbix ID: {svc.zabbix_serviceid}</p>
                </div>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                  {svc.tags.find(t => t.tag === 'service')?.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Downtime Modal */}
      {showAddForm && (
        <AddDowntimeModal
          slaId={sla.zabbix_slaid}
          onClose={() => setShowAddForm(false)}
          onAdd={(downtime) => {
            setExcludedDowntimes([...excludedDowntimes, downtime]);
            setShowAddForm(false);
          }}
        />
      )}
    </div>
  );
}

function AddDowntimeModal({ slaId, onClose, onAdd }: {
  slaId: string;
  onClose: () => void;
  onAdd: (downtime: ExcludedDowntime) => void;
}) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const downtime: ExcludedDowntime = {
      name: name || `SLA Planner #manual`,
      period_from: Math.floor(start.getTime() / 1000).toString(),
      period_to: Math.floor(end.getTime() / 1000).toString(),
    };

    // В реальности — вызов API для push в Zabbix
    // await api.addExcludedDowntime(slaId, downtime);
    
    onAdd(downtime);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Добавить исключение простоя</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название (опционально)</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Автоматически: SLA Planner #..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Начало (UTC) *</label>
            <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Окончание (UTC) *</label>
            <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800">
              Отмена
            </button>
            <button type="submit" disabled={saving}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Добавление...' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
