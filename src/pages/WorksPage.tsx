import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Calendar, List, Loader2, Pencil, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import { api } from '../api/client';
import { SLA, Service, PlannedWork, WorkSeries, WorkStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../permissions';
import { useToast } from '../context/ToastContext';
import { formatDateTimeShort, toMskInputValue, mskInputToDate } from '../time';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';
import WorksCalendar from '../components/WorksCalendar';
import Button from '../components/ui/Button';
import { useModalA11y } from '../hooks/useModalA11y';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Человекочитаемое расписание серии: «Сб в 13:00 (60 мин)». */
function formatSchedule(s: WorkSeries): string {
  const days = s.weekdays.map(d => WEEKDAY_LABELS[d] ?? d).join(', ');
  return `${days} в ${s.start_time} (${s.duration_minutes} мин)`;
}

export default function WorksPage() {
  const { showToast } = useToast();
  const { can } = useAuth();
  const [works, setWorks] = useState<PlannedWork[]>([]);
  const [slas, setSlas] = useState<SLA[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [seriesList, setSeriesList] = useState<WorkSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingWork, setEditingWork] = useState<PlannedWork | null>(null);
  const [editingSeries, setEditingSeries] = useState<WorkSeries | null>(null);
  const [filter, setFilter] = useState<WorkStatus | 'all'>('all');
  const [view, setView] = useState<'table' | 'calendar'>('table');
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; workId: number | null; seriesId: number | null; seriesTitle: string }>(
    { isOpen: false, workId: null, seriesId: null, seriesTitle: '' }
  );
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [w, s, svc, ser] = await Promise.all([
        api.getPlannedWorks(), api.getSLAs(), api.getServices(), api.getWorkSeries(),
      ]);
      setWorks(w); setSlas(s); setServices(svc); setSeriesList(ser);
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

  const openEdit = (work: PlannedWork) => {
    if (work.series_id) {
      const series = seriesList.find(s => s.id === work.series_id);
      if (series) {
        setEditingSeries(series);
        setEditingWork(null);
        setShowForm(true);
        return;
      }
    }
    setEditingSeries(null);
    setEditingWork(work);
    setShowForm(true);
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

  const handleDelete = (work: PlannedWork) => {
    if (work.series_id) {
      setDeleteModal({ isOpen: true, workId: null, seriesId: work.series_id, seriesTitle: work.title });
    } else {
      setDeleteModal({ isOpen: true, workId: work.id, seriesId: null, seriesTitle: '' });
    }
  };

  const confirmDelete = async () => {
    if (deleteModal.seriesId) {
      await api.deleteWorkSeries(deleteModal.seriesId);
      showToast('success', 'Циклическая серия удалена');
    } else if (deleteModal.workId) {
      await api.deletePlannedWork(deleteModal.workId);
      showToast('success', 'Плановая работа удалена');
    }
    setDeleteModal({ isOpen: false, workId: null, seriesId: null, seriesTitle: '' });
    await loadData();
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
            <Button icon={Plus} onClick={() => { setEditingWork(null); setEditingSeries(null); setShowForm(true); }}>
              Создать работу
            </Button>
          )}
        </div>
      </div>

      {/* Циклические работы (серии) */}
      {seriesList.length > 0 && (
        <div className="bg-surface rounded-xl shadow-card border border-line p-4">
          <h3 className="text-sm font-semibold mb-3">Циклические работы</h3>
          <div className="space-y-2">
            {seriesList.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-content truncate">
                    {s.title}
                    <span className="ml-2 text-xs text-faint">{formatSchedule(s)}</span>
                  </div>
                  <div className="text-xs text-faint truncate">
                    {s.sla_name} / {s.service_name} · вхождений: {s.occurrence_count}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {can(PERMISSIONS.worksEdit) && (
                    <button onClick={() => { setEditingSeries(s); setEditingWork(null); setShowForm(true); }}
                      className="text-muted hover:text-content transition-colors" title="Редактировать серию">
                      <Pencil />
                    </button>
                  )}
                  {can(PERMISSIONS.worksDelete) && (
                    <button onClick={() => setDeleteModal({ isOpen: true, workId: null, seriesId: s.id, seriesTitle: s.title })}
                      className="text-danger-fg hover:text-danger-fg transition-colors" title="Удалить серию">
                      <Trash2 />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                    <div className="font-medium text-content flex items-center gap-2">
                      {work.title}
                      {work.series_id && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-soft text-accent" title="Вхождение цикла">
                          цикл
                        </span>
                      )}
                    </div>
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
                        <button onClick={() => openEdit(work)}
                          className="text-muted hover:text-content transition-colors"
                          title={work.series_id ? 'Редактировать серию' : 'Редактировать'}>
                          <Pencil />
                        </button>
                      )}
                      {can(PERMISSIONS.worksDelete) && (
                        <button onClick={() => handleDelete(work)}
                          className="text-danger-fg hover:text-danger-fg transition-colors"
                          title={work.series_id ? 'Удалить серию' : 'Удалить'}>
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
          series={editingSeries}
          slas={slas}
          services={services}
          onClose={() => { setShowForm(false); setEditingSeries(null); }}
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
          onSaveSeries={async (data) => {
            try {
              if (editingSeries) {
                const updated = await api.updateWorkSeries(editingSeries.id, data);
                showToast('success', `Серия обновлена (вхождений: ${updated.occurrence_count ?? 0})`);
              } else {
                const created = await api.createWorkSeries(data);
                showToast('success', `Серия создана (вхождений: ${created.occurrence_count ?? 0})`);
              }
              setShowForm(false);
              setEditingSeries(null);
              await loadData();
            } catch (err: any) {
              showToast('error', err?.message || 'Ошибка сохранения серии');
            }
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={deleteModal.seriesId ? 'Удалить циклическую работу?' : 'Удалить плановую работу?'}
        message={deleteModal.seriesId
          ? `Будет удалена вся серия «${deleteModal.seriesTitle}» и все её вхождения (включая окна в Zabbix). Это действие нельзя отменить.`
          : 'Это действие нельзя отменить. Все связанные данные будут удалены.'}
        confirmText="Удалить"
        cancelText="Отмена"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, workId: null, seriesId: null, seriesTitle: '' })}
      />
    </div>
  );
}

function WorkFormModal({ work, series, slas, services, onClose, onSave, onSaveSeries }: {
  work: PlannedWork | null;
  series: WorkSeries | null;
  slas: SLA[];
  services: Service[];
  onClose: () => void;
  onSave: (data: Partial<PlannedWork>) => Promise<void>;
  onSaveSeries: (data: Partial<WorkSeries>) => Promise<void>;
}) {
  const isSeries = !!series;
  const [recurring, setRecurring] = useState(isSeries);
  const [title, setTitle] = useState(work?.title || series?.title || '');
  const [description, setDescription] = useState(work?.description || series?.description || '');
  const [slaId, setSlaId] = useState((work?.sla_id ?? series?.sla_id)?.toString() || '');
  const [serviceId, setServiceId] = useState((work?.service_id ?? series?.service_id)?.toString() || '');
  const [startDate, setStartDate] = useState(work?.started_at ? toMskInputValue(work.started_at) : '');
  const [endDate, setEndDate] = useState(work?.ended_at ? toMskInputValue(work.ended_at) : '');
  const [weekdays, setWeekdays] = useState<number[]>(series?.weekdays || []);
  const [startTime, setStartTime] = useState(series?.start_time || '13:00');
  const [duration, setDuration] = useState((series?.duration_minutes ?? 60).toString());
  const [error, setError] = useState('');
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

  const toggleWeekday = (day: number) => {
    setWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (recurring) {
      if (weekdays.length === 0) {
        setError('Выберите хотя бы один день недели');
        return;
      }
      const dur = parseInt(duration);
      if (!/^\d{1,2}:\d{2}$/.test(startTime)) {
        setError('Укажите время начала в формате ЧЧ:ММ');
        return;
      }
      if (!Number.isFinite(dur) || dur <= 0) {
        setError('Укажите длительность в минутах');
        return;
      }
      setSaving(true);
      try {
        await onSaveSeries({
          title, description,
          sla_id: parseInt(slaId), service_id: parseInt(serviceId),
          weekdays, start_time: startTime, duration_minutes: dur,
          sla_name: slas.find(s => s.id === parseInt(slaId))?.name,
          service_name: filteredServices.find(s => s.id === parseInt(serviceId))?.name,
        });
      } finally {
        setSaving(false);
      }
      return;
    }

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
          <h2 className="text-lg font-semibold">{isSeries ? 'Редактировать циклическую работу' : work ? 'Редактировать работу' : 'Новая плановая работа'}</h2>
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
          {!isSeries && (
            <label className="flex items-center gap-2 text-sm text-content cursor-pointer select-none">
              <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)}
                className="rounded border-line-strong" />
              Повторять еженедельно (цикл)
            </label>
          )}
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
          {recurring ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-content mb-1">Дни недели *</label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_LABELS.map((label, idx) => (
                    <button key={idx} type="button" onClick={() => toggleWeekday(idx)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${weekdays.includes(idx) ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface border-line text-muted hover:bg-surface-2'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content mb-1">Время начала (МСК) *</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required
                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content mb-1">Длительность, мин *</label>
                  <input type="number" min={1} max={1440} value={duration} onChange={e => setDuration(e.target.value)} required
                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
                </div>
              </div>
              <p className="text-xs text-faint">
                Вхождения создаются на 8 недель вперёд и продлеваются автоматически.
              </p>
            </div>
          ) : (
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
          )}
          {error && <p className="text-xs text-danger-fg">{error}</p>}
          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <Button variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" loading={saving}>
              {recurring ? (isSeries ? 'Сохранить серию' : 'Создать серию') : work ? 'Обновить' : 'Создать'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
