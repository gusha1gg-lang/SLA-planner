import React, { useEffect, useRef, useState } from 'react';
import { CircleUser, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import { Group, Service, User } from '../types';
import { buildHealthModels, HealthModel } from '../healthModels';
import { PERMISSION_LABELS, PERMISSION_SECTIONS } from '../permissions';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import { useModalA11y } from '../hooks/useModalA11y';

interface GroupForm {
  name: string;
  description: string;
  permissions: string[];
  all_models: boolean;
  model_ids: string[];
  member_ids: number[];
}

const emptyForm: GroupForm = { name: '', description: '', permissions: [], all_models: true, model_ids: [], member_ids: [] };

export default function GroupsPage() {
  const { showToast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [models, setModels] = useState<HealthModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<GroupForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  /** Как в Grafana: участник добавляется через «+» (раскрывается выбор пользователя). */
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newMemberId, setNewMemberId] = useState<number | ''>('');

  // Esc / клик по фону / фокус-трап для окна группы.
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(showModal, modalRef, () => setShowModal(false));

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [g, u, s] = await Promise.all([api.getGroups(), api.getUsers(), api.getServices()]);
      setGroups(g);
      setUsers(u);
      setModels(buildHealthModels(s as Service[]));
    } catch (err: any) {
      showToast('error', 'Не удалось загрузить группы: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setAddMemberOpen(false);
    setNewMemberId('');
    setShowModal(true);
  };

  const openEdit = (group: Group) => {
    setEditingId(group.id);
    setForm({
      name: group.name,
      description: group.description,
      permissions: group.permissions.filter(p => PERMISSION_LABELS[p]),
      all_models: group.all_models,
      model_ids: [...group.model_ids],
      member_ids: [...group.member_ids],
    });
    setAddMemberOpen(false);
    setNewMemberId('');
    setShowModal(true);
  };

  const toggleModel = (rootId: string) => {
    setForm(prev => ({
      ...prev,
      model_ids: prev.model_ids.includes(rootId)
        ? prev.model_ids.filter(id => id !== rootId)
        : [...prev.model_ids, rootId],
    }));
  };

  const removeMember = (userId: number) => {
    setForm(prev => ({ ...prev, member_ids: prev.member_ids.filter(id => id !== userId) }));
  };

  const addMember = () => {
    if (newMemberId === '') return;
    const id = Number(newMemberId);
    if (!form.member_ids.includes(id)) {
      setForm(prev => ({ ...prev, member_ids: [...prev.member_ids, id] }));
    }
    setNewMemberId('');
    setAddMemberOpen(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('error', 'Укажите название группы'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        permissions: form.permissions,
        all_models: form.all_models,
        model_ids: form.all_models ? [] : form.model_ids,
        member_ids: form.member_ids,
      };
      if (editingId === null) {
        await api.createGroup(payload);
        showToast('success', 'Группа создана');
      } else {
        await api.updateGroup(editingId, payload);
        showToast('success', 'Изменения сохранены');
      }
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      showToast('error', 'Ошибка сохранения: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (group: Group) => {
    if (!window.confirm(`Удалить группу «${group.name}»? Пользователи потеряют её права.`)) return;
    try {
      await api.deleteGroup(group.id);
      showToast('success', 'Группа удалена');
      await loadData();
    } catch (err: any) {
      showToast('error', 'Ошибка удаления: ' + err.message);
    }
  };

  const userName = (id: number) => users.find(u => u.id === id)?.username || `#${id}`;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="text-3xl text-accent animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content">Группы</h1>
        <p className="text-muted mt-1">
          Группа — это набор прав, область моделей здоровья и состав участников (как команды в Grafana).
          Нажмите на название группы, чтобы её отредактировать и добавить участников.
        </p>
      </div>

      <div className="bg-surface rounded-xl shadow-card border border-line overflow-hidden">
        <div className="p-5 border-b border-line flex items-center justify-between">
          <h2 className="text-lg font-semibold">Группы и права</h2>
          <Button icon={Plus} onClick={openCreate}>
            Создать группу
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-muted">Название</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Права</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Модели здоровья</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Участники</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {groups.map(group => {
                const memberNames = group.member_ids
                  .map(id => users.find(u => u.id === id)?.username)
                  .filter(Boolean) as string[];
                return (
                  <tr key={group.id} className="hover:bg-surface-2 align-top">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(group)}
                          className="font-medium text-accent hover:text-accent hover:underline text-left"
                          title="Редактировать группу">
                          {group.name}
                        </button>
                        {group.is_system && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-warn-soft text-warn-fg" title="Системная группа, создаётся автоматически">системная</span>
                        )}
                      </div>
                      {group.description && <p className="text-xs text-muted mt-0.5">{group.description}</p>}
                    </td>
                    <td className="px-5 py-3">
                      {group.permissions.length === 0 ? (
                        <span className="text-faint">нет прав</span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {group.permissions.map(p => (
                            <span key={p} className="px-2 py-0.5 rounded-full text-xs bg-accent-soft text-accent">
                              {PERMISSION_LABELS[p] || p}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {group.all_models ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-ok-soft text-ok-fg" title="Группа видит все модели здоровья">все модели</span>
                      ) : group.model_ids.length === 0 ? (
                        <span className="text-faint">нет доступа</span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {group.model_ids.map(id => (
                            <span key={id} className="px-2 py-0.5 rounded-full text-xs bg-surface-2 text-content">
                              {models.find(m => m.rootId === id)?.rootName || `#${id}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {memberNames.length === 0 ? <span className="text-faint">—</span> : `${memberNames.length}: ${memberNames.join(', ')}`}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <button onClick={() => openEdit(group)}
                        className="text-accent hover:text-accent mr-3 transition-colors" title="Редактировать">
                        <Pencil />
                      </button>
                      {!group.is_system && (
                        <button onClick={() => handleDelete(group)} className="text-danger-fg hover:text-danger-fg transition-colors" title="Удалить">
                          <Trash2 />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {groups.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-faint">Групп пока нет</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-overlay-in" onClick={() => setShowModal(false)}>
          <div
            ref={modalRef}
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
            className="bg-surface rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in outline-none"
          >
            <div className="p-5 border-b border-line flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingId === null ? 'Новая группа' : 'Редактировать группу'}</h2>
              <button onClick={() => setShowModal(false)} className="text-faint hover:text-muted transition-colors" title="Закрыть"><X /></button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content mb-1">Название</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-line-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content mb-1">Описание</label>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                    className="w-full border border-line-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>

              {/* Permissions */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-content">Права группы</p>
                {PERMISSION_SECTIONS.map(section => (
                  <div key={section.title}>
                    <p className="text-xs font-medium text-muted uppercase mb-1.5">{section.title}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {section.items.map(item => (
                        <label key={item.key} className="flex items-start gap-2 p-2 rounded-lg border border-line hover:bg-surface-2 cursor-pointer">
                          <input type="checkbox" className="mt-0.5"
                            checked={form.permissions.includes(item.key)}
                            onChange={() => setForm(prev => ({
                              ...prev,
                              permissions: prev.permissions.includes(item.key)
                                ? prev.permissions.filter(p => p !== item.key)
                                : [...prev.permissions, item.key],
                            }))} />
                          <span>
                            <span className="block text-sm text-content">{item.label}</span>
                            <span className="block text-xs text-faint">{item.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Область моделей здоровья: группа видит все модели или только отмеченные */}
              <div>
                <p className="text-sm font-semibold text-content mb-1.5">Модели здоровья</p>
                <label className="flex items-center gap-2 p-2 rounded-lg border border-line hover:bg-surface-2 cursor-pointer">
                  <input type="checkbox"
                    checked={form.all_models}
                    onChange={() => setForm({ ...form, all_models: !form.all_models })} />
                  <span className="text-sm text-content">Все модели здоровья</span>
                </label>
                {!form.all_models && (
                  models.length === 0 ? (
                    <p className="text-sm text-faint mt-2">Модели не загружены — выполните синхронизацию.</p>
                  ) : (
                    <>
                      <p className="text-xs text-muted mt-2 mb-1">
                        Отметьте модели, которые видит группа ({form.model_ids.length} из {models.length}):
                      </p>
                      <div className="border border-line rounded-lg divide-y divide-line max-h-56 overflow-y-auto">
                        {models.map(m => (
                          <label key={m.rootId} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2 cursor-pointer">
                            <input type="checkbox"
                              checked={form.model_ids.includes(m.rootId)}
                              onChange={() => toggleModel(m.rootId)} />
                            <span className="text-sm text-content truncate" title={m.rootName}>{m.rootName}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )
                )}
              </div>

              {/* Участники: как в Grafana — список + «+ Добавить участника» */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-content">Участники</p>
                  <button type="button" onClick={() => setAddMemberOpen(v => !v)}
                    className="text-sm text-accent hover:text-accent transition-colors">
                    <Plus className="mr-1" />Добавить участника
                  </button>
                </div>

                {addMemberOpen && (
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      value={newMemberId}
                      onChange={e => setNewMemberId(e.target.value === '' ? '' : Number(e.target.value))}
                      className="flex-1 border border-line-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Выберите пользователя…</option>
                      {users.filter(u => !form.member_ids.includes(u.id)).map(u => (
                        <option key={u.id} value={u.id}>{u.username}</option>
                      ))}
                    </select>
                    <Button size="sm" onClick={addMember} disabled={newMemberId === ''}>
                      Добавить
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => { setAddMemberOpen(false); setNewMemberId(''); }}>
                      Отмена
                    </Button>
                  </div>
                )}

                {form.member_ids.length === 0 ? (
                  <p className="text-sm text-faint border border-dashed border-line rounded-lg px-3 py-3 text-center">
                    Пока никого нет — добавьте участников через «+ Добавить участника».
                  </p>
                ) : (
                  <div className="border border-line rounded-lg divide-y divide-line max-h-56 overflow-y-auto">
                    {form.member_ids.map(id => {
                      const u = users.find(x => x.id === id);
                      return (
                        <div key={id} className="flex items-center justify-between px-3 py-2">
                          <span className="flex items-center gap-2 text-sm text-content">
                            <CircleUser className="text-faint" />
                            {u?.username || `#${id}`}
                            {u?.role === 'admin' && <span className="text-xs text-faint">(админ — группы не важны)</span>}
                          </span>
                          <button type="button" onClick={() => removeMember(id)}
                            className="text-faint hover:text-danger-fg transition-colors" title="Убрать из группы">
                            <X />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-line flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowModal(false)}>
                Отмена
              </Button>
              <Button onClick={handleSave} loading={saving}>
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}