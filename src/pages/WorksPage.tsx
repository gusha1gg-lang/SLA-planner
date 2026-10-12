import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Calendar, List, Loader2, Pencil, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import { api } from '../api/client';
import { SLA, Service, PlannedWork, WorkStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../permissions';
import { useToast } from '../context/ToastContext';
import { formatDateTimeShort, toMskInputValue, mskInputToDate } from '../time';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';
import WorksCalendar from '../components/WorksCalendar';
import Button from '../components/ui/Button';
import { useModalA11y } from '../hooks/useModalA11y';

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
    draft: 'bg-surface-2 text-content', planned: 'bg-accent-soft text-accent',
    active: 'bg-warn-soft text-warn-fg', done: 'bg-ok-soft text-ok-fg',
    cancelled: 'bg-surface-2 text-muted', sync_error: 'bg-danger-soft text-danger-fg',
  };
  const statusLabels: Record<string, string> = {
    draft: 'Черновик', planned: 'Запланировано', active: 'Активно',
    done: 'Завершено', cancelled: 'Отменено', sync_error: 'Ошибка отправки',
  };

  const filteredWorks = filter === 'all' ? works : works.filter(w => w.status === filter);
  const totalPages = Math.ceil(filteredWorks.length / itemsPerPage);
  const paginatedWorks = filteredWorks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handlePushToZabbix = async (id: number) => {
    const result = await api.pushToZabbix(id);
    if (result.success) {
      await loadData();
    } else {
      alert('Не удалось отправить: ' + result.error);
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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="text-3xl text-accent animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content">Плановые работы</h1>
          <p className="text-muted mt-1">Управление исключениями простоя для SLA</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-surface-2 rounded-lg p-1">
            <button onClick={() => setView('table')} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === 'table' ? 'bg-surface shadow-card' : 'hover:bg-surface'}`}>
              <List className="mr-1" />Таблица
            </button>
            <button onClick={() => setView('calendar')} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === 'calendar' ? 'bg-surface shadow-card' : 'hover:bg-surface'}`}>
              <Calendar className="mr-1" />Календарь
            </button>
          </div>
          {can(PERMISSIONS.worksEdit) && (
            <Button icon={Plus} onClick={() => { setEditingWork(null); setShowForm(true); }}>
              Создать работу
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'draft', 'planned', 'active', 'done', 'cancelled', 'sync_error'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm ${filter === s ? 'bg-brand-600 text-white' : 'bg-surface border border-line text-muted hover:bg-surface-2'}`}>
            {s === 'all' ? 'Все' : statusLabels[s]}
            <span className="ml-1.5 opacity-70">
              {s === 'all' ? works.length : works.filter(w => w.status === s).length}
            </span>
          </button>
        ))}
      </div>

      {view === 'table' ? (
        <div className="bg-surface rounded-xl shadow-card border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted">Название</th>
                <th className="text-left px-4 py-3 font-medium text-muted">SLA / Услуга</th>
                <th className="text-left px-4 py-3 font-medium text-muted">Период</th>
                <th className="text-left px-4 py-3 font-medium text-muted">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-muted">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {paginatedWorks.map(work => (
                <tr key={work.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <div className="font-medium text-content">{work.title}</div>
                    <div className="text-xs text-faint mt-0.5">{work.downtime_marker}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-content">{work.sla_name}</div>
                    <div className="text-xs text-faint">{work.service_name}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <div>{formatDateTimeShort(work.started_at)}</div>
                    <div className="text-xs text-faint">— {formatDateTimeShort(work.ended_at)}</div>
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
                          className="text-accent hover:text-accent text-xs font-medium transition-colors" title="Отправить">
                          <UploadCloud className="mr-1" />Отправить
                        </button>
                      )}
                      {can(PERMISSIONS.worksEdit) && (
                        <button onClick={() => { setEditingWork(work); setShowForm(true); }}
                          className="text-muted hover:text-content transition-colors" title="Редактировать">
                          <Pencil />
                        </button>
                      )}
                      {can(PERMISSIONS.worksDelete) && (
                        <button onClick={() => handleDelete(work.id)}
                          className="text-danger-fg hover:text-danger-fg transition-colors" title="Удалить">
                          <Trash2 />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedWorks.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-faint">Нет плановых работ</td></tr>
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
        <WorksCalendar works={works} />
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
  const [startDate, setStartDate] = useState(work?.started_at ? toMskInputValue(work.started_at) : '');
  const [endDate, setEndDate] = useState(work?.ended_at ? toMskInputValue(work.ended_at) : '');
  const [saving, setSaving] = useState(false);
  const [filteredServices, setFilteredServices] = useState<Service[]>([]);

  const panelRef = useRef<HTMLDivElement>(null);
  // Окно рендерится только когда открыто — Esc/фон/фокус-трап включаем сразу.
  useModalA11y(true, panelRef, onClose);

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
      const start = mskInputToDate(startDate);
      const end = mskInputToDate(endDate);
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-overlay-in" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in outline-none"
      >
        <div className="p-5 border-b border-line flex items-center justify-between">
          <h2 className="text-lg font-semibold">{work ? 'Редактировать работу' : 'Новая плановая работа'}</h2>
          <button onClick={onClose} className="text-faint hover:text-muted transition-colors" title="Закрыть"><X /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-content mb-1">Название *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required
              className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="Например: ТО базы данных" />
          </div>
          <div>
            <label className="block text-sm font-medium text-content mb-1">Описание</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="Детали работы..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content mb-1">SLA *</label>
              <select value={slaId} onChange={e => setSlaId(e.target.value)} required
                className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-brand-500 outline-none">
                <option value="">Выберите SLA</option>
                {slas.map(s => <option key={s.id} value={s.id}>{s.name} (SLO {s.slo}%)</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Услуга *
                {slaId && filteredServices.length > 0 && (
                  <span className="text-xs text-muted ml-2">({filteredServices.length} доступно)</span>
                )}
              </label>
              <select 
                value={serviceId} 
                onChange={e => setServiceId(e.target.value)} 
                required
                disabled={!slaId}
                className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-surface-2 disabled:cursor-not-allowed"
              >
                <option value="">
                  {!slaId ? 'Сначала выберите SLA' : 
                   filteredServices.length === 0 ? 'Нет услуг для этого SLA' : 
                   'Выберите услугу'}
                </option>
                {filteredServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {slaId && filteredServices.length === 0 && (
                <p className="text-xs text-warn-fg mt-1">
                  <AlertTriangle className="mr-1" />
                  Для выбранного SLA нет услуг.
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content mb-1">Начало (МСК) *</label>
              <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} required
                className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-content mb-1">Окончание (МСК) *</label>
              <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} required
                className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <Button variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" loading={saving}>
              {work ? 'Обновить' : 'Создать'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
