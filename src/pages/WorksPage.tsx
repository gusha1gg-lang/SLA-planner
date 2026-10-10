import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { SLA, Service, PlannedWork, WorkStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../permissions';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';

export default function WorksPage() {
  const { showToast } = useToast();
  const { can } = useAuth();
  const [works, setWorks] = useState<PlannedWork[]>([]);
  const [slas, setSlas] = useState<SLA[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingWork, setEditingWork] = useState<PlannedWork | null>(null);
  const [filter, setFilter] = useState<WorkStatus | 'all'>('all');
  const [view, setView] = useState<'table' | 'calendar'>('table');
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; workId: number | null }>({ isOpen: false, workId: null });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [w, s, svc] = await Promise.all([api.getPlannedWorks(), api.getSLAs(), api.getServices()]);
      setWorks(w); setSlas(s); setServices(svc);
    } finally { setLoading(false); }
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700', planned: 'bg-blue-100 text-blue-700',
    active: 'bg-yellow-100 text-yellow-700', done: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500', sync_error: 'bg-red-100 text-red-700',
  };
  const statusLabels: Record<string, string> = {
    draft: 'Черновик', planned: 'Запланировано', active: 'Активно',
    done: 'Завершено', cancelled: 'Отменено', sync_error: 'Ошибка синхр.',
  };

  const filteredWorks = filter === 'all' ? works : works.filter(w => w.status === filter);
  const totalPages = Math.ceil(filteredWorks.length / itemsPerPage);
  const paginatedWorks = filteredWorks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handlePushToZabbix = async (id: number) => {
    const result = await api.pushToZabbix(id);
    if (result.success) {
      await loadData();
    } else {
      alert('Ошибка синхронизации: ' + result.error);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleteModal({ isOpen: true, workId: id });
  };

  const confirmDelete = async () => {
    if (deleteModal.workId) {
      await api.deletePlannedWork(deleteModal.workId);
      showToast('success', 'Плановая работа удалена');
      await loadData();
    }
    setDeleteModal({ isOpen: false, workId: null });
  };

  // Calendar helpers
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay() || 7;

  const getWorksForDay = (day: number) => {
    return works.filter(w => {
      const start = new Date(w.started_at);
      const end = new Date(w.ended_at);
      const checkDate = new Date(calYear, calMonth, day);
      return checkDate >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
             checkDate <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-blue-600"></i></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Плановые работы</h1>
          <p className="text-gray-500 mt-1">Управление исключениями простоя для SLA</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button onClick={() => setView('table')} className={`px-3 py-1.5 rounded-md text-sm ${view === 'table' ? 'bg-white shadow-sm' : ''}`}>
              <i className="fas fa-list mr-1"></i>Таблица
            </button>
            <button onClick={() => setView('calendar')} className={`px-3 py-1.5 rounded-md text-sm ${view === 'calendar' ? 'bg-white shadow-sm' : ''}`}>
              <i className="fas fa-calendar mr-1"></i>Календарь
            </button>
          </div>
          {can(PERMISSIONS.worksEdit) && (
            <button onClick={() => { setEditingWork(null); setShowForm(true); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
              <i className="fas fa-plus mr-2"></i>Создать работу
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'draft', 'planned', 'active', 'done', 'cancelled', 'sync_error'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm ${filter === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {s === 'all' ? 'Все' : statusLabels[s]}
            <span className="ml-1.5 opacity-70">
              {s === 'all' ? works.length : works.filter(w => w.status === s).length}
            </span>
          </button>
        ))}
      </div>

      {view === 'table' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Название</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">SLA / Услуга</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Период</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedWorks.map(work => (
                <tr key={work.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{work.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{work.downtime_marker}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700">{work.sla_name}</div>
                    <div className="text-xs text-gray-400">{work.service_name}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div>{new Date(work.started_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    <div className="text-xs text-gray-400">— {new Date(work.ended_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[work.status]}`}>
                      {statusLabels[work.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {can(PERMISSIONS.worksEdit) && work.status === 'draft' && (
                        <button onClick={() => handlePushToZabbix(work.id)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium" title="Отправить в Zabbix">
                          <i className="fas fa-cloud-upload-alt mr-1"></i>Push
                        </button>
                      )}
                      {can(PERMISSIONS.worksEdit) && (
                        <button onClick={() => { setEditingWork(work); setShowForm(true); }}
                          className="text-gray-500 hover:text-gray-700" title="Редактировать">
                          <i className="fas fa-edit"></i>
                        </button>
                      )}
                      {can(PERMISSIONS.worksDelete) && (
                        <button onClick={() => handleDelete(work.id)}
                          className="text-red-500 hover:text-red-700" title="Удалить">
                          <i className="fas fa-trash"></i>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedWorks.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Нет плановых работ</td></tr>
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredWorks.length}
            itemsPerPage={itemsPerPage}
          />
        </div>
      ) : (
        /* Calendar View */
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); }}
              className="p-2 hover:bg-gray-100 rounded-lg"><i className="fas fa-chevron-left"></i></button>
            <h3 className="text-lg font-semibold">
              {new Date(calYear, calMonth).toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}
            </h3>
            <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); }}
              className="p-2 hover:bg-gray-100 rounded-lg"><i className="fas fa-chevron-right"></i></button>
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
              <div key={d} className="bg-gray-50 p-2 text-center text-xs font-medium text-gray-500">{d}</div>
            ))}
            {Array.from({ length: firstDayOfWeek - 1 }, (_, i) => (
              <div key={`empty-${i}`} className="bg-gray-50 p-2 min-h-[80px]"></div>
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayWorks = getWorksForDay(day);
              const isToday = day === new Date().getDate() && calMonth === new Date().getMonth() && calYear === new Date().getFullYear();
              return (
                <div key={day} className={`bg-white p-2 min-h-[80px] ${isToday ? 'ring-2 ring-blue-500 ring-inset' : ''}`}>
                  <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{day}</div>
                  {dayWorks.slice(0, 2).map(w => (
                    <div key={w.id} className={`text-xs px-1.5 py-0.5 rounded mb-0.5 truncate ${
                      w.status === 'done' ? 'bg-green-100 text-green-700' :
                      w.status === 'planned' ? 'bg-blue-100 text-blue-700' :
                      w.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{w.title}</div>
                  ))}
                  {dayWorks.length > 2 && <div className="text-xs text-gray-400">+{dayWorks.length - 2} ещё</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <WorkFormModal
          work={editingWork}
          slas={slas}
          services={services}
          onClose={() => setShowForm(false)}
          onSave={async (data) => {
            try {
              if (editingWork) {
                await api.updatePlannedWork(editingWork.id, data);
                showToast('success', 'Плановая работа обновлена');
              } else {
                await api.createPlannedWork(data);
                showToast('success', 'Плановая работа создана');
              }
              setShowForm(false);
              await loadData();
            } catch (err: any) {
              showToast('error', err?.message || 'Ошибка сохранения работы');
            }
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="Удалить плановую работу?"
        message="Это действие нельзя отменить. Все связанные данные будут удалены."
        confirmText="Удалить"
        cancelText="Отмена"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, workId: null })}
      />
    </div>
  );
}

function WorkFormModal({ work, slas, services, onClose, onSave }: {
  work: PlannedWork | null;
  slas: SLA[];
  services: Service[];
  onClose: () => void;
  onSave: (data: Partial<PlannedWork>) => Promise<void>;
}) {
  const [title, setTitle] = useState(work?.title || '');
  const [description, setDescription] = useState(work?.description || '');
  const [slaId, setSlaId] = useState(work?.sla_id?.toString() || '');
  const [serviceId, setServiceId] = useState(work?.service_id?.toString() || '');
  const [startDate, setStartDate] = useState(work?.started_at ? new Date(work.started_at).toISOString().slice(0, 16) : '');
  const [endDate, setEndDate] = useState(work?.ended_at ? new Date(work.ended_at).toISOString().slice(0, 16) : '');
  const [saving, setSaving] = useState(false);
  const [filteredServices, setFilteredServices] = useState<Service[]>([]);

  // Фильтрация услуг по выбранному SLA
  useEffect(() => {
    if (!slaId) {
      setFilteredServices([]);
      setServiceId('');
      return;
    }

    const selectedSla = slas.find(s => s.id === parseInt(slaId));
    if (!selectedSla || !selectedSla.service_tags || selectedSla.service_tags.length === 0) {
      setFilteredServices([]);
      setServiceId('');
      return;
    }

    // Фильтруем услуги: оставляем только те, у которых теги совпадают с service_tags SLA
    const filtered = services.filter(service => {
      return service.tags.some(tag => 
        tag.tag === 'service' && selectedSla.service_tags?.includes(tag.value)
      );
    });

    setFilteredServices(filtered);
    
    // Если выбранная услуга больше не в списке, сбрасываем выбор
    if (serviceId && !filtered.find(s => s.id === parseInt(serviceId))) {
      setServiceId('');
    }
  }, [slaId, slas, services]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      await onSave({
        title, description,
        sla_id: parseInt(slaId), service_id: parseInt(serviceId),
        started_at: start.toISOString(), ended_at: end.toISOString(),
        downtime_period_from: Math.floor(start.getTime() / 1000),
        downtime_period_to: Math.floor(end.getTime() / 1000),
        sla_name: slas.find(s => s.id === parseInt(slaId))?.name,
        service_name: filteredServices.find(s => s.id === parseInt(serviceId))?.name,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{work ? 'Редактировать работу' : 'Новая плановая работа'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Например: ТО базы данных" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Детали работы..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SLA *</label>
              <select value={slaId} onChange={e => setSlaId(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Выберите SLA</option>
                {slas.map(s => <option key={s.id} value={s.id}>{s.name} (SLO {s.slo}%)</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Услуга *
                {slaId && filteredServices.length > 0 && (
                  <span className="text-xs text-gray-500 ml-2">({filteredServices.length} доступно)</span>
                )}
              </label>
              <select 
                value={serviceId} 
                onChange={e => setServiceId(e.target.value)} 
                required
                disabled={!slaId}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">
                  {!slaId ? 'Сначала выберите SLA' : 
                   filteredServices.length === 0 ? 'Нет услуг для этого SLA' : 
                   'Выберите услугу'}
                </option>
                {filteredServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {slaId && filteredServices.length === 0 && (
                <p className="text-xs text-orange-600 mt-1">
                  <i className="fas fa-exclamation-triangle mr-1"></i>
                  Для выбранного SLA нет услуг. Синхронизируйте услуги из Zabbix.
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
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
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800">Отмена</button>
            <button type="submit" disabled={saving}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Сохранение...' : work ? 'Обновить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
