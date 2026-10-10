import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Group, Service, User } from '../types';
import { buildHealthModels, HealthModel } from '../healthModels';
import { PERMISSION_LABELS, PERMISSION_SECTIONS } from '../permissions';
import { useToast } from '../context/ToastContext';

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
    setShowModal(true);
  };

  const openEdit = (group: Group) => {
    setEditingId(group.id);
    setForm({
      name: group.name,
      description: group.description,
      permissions: [...group.permissions],
      all_models: group.all_models,
      model_ids: [...group.model_ids],
      member_ids: [...group.member_ids],
    });
    setShowModal(true);
  };

  const togglePermission = (key: string) => {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter(p => p !== key)
        : [...prev.permissions, key],
    }));
  };

  const toggleModel = (rootId: string) => {
    setForm(prev => ({
      ...prev,
      model_ids: prev.model_ids.includes(rootId)
        ? prev.model_ids.filter(id => id !== rootId)
        : [...prev.model_ids, rootId],
    }));
  };

  const toggleMember = (userId: number) => {
    setForm(prev => ({
      ...prev,
      member_ids: prev.member_ids.includes(userId)
        ? prev.member_ids.filter(id => id !== userId)
        : [...prev.member_ids, userId],
    }));
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
    return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-blue-600"></i></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Группы</h1>
        <p className="text-gray-500 mt-1">
          Группа — это набор прав и состав участников. Пользователь получает сумму прав своих групп (как в Grafana).
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Группы и права</h2>
          <button onClick={openCreate}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <i className="fas fa-plus mr-2"></i>Создать группу
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Название</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Права</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Модели здоровья</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Участники</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {groups.map(group => {
                const memberNames = group.member_ids
                  .map(id => users.find(u => u.id === id)?.username)
                  .filter(Boolean) as string[];
                return (
                  <tr key={group.id} className="hover:bg-gray-50 align-top">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{group.name}</span>
                        {group.is_system && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-700" title="Системная группа, создаётся автоматически">системная</span>
                        )}
                      </div>
                      {group.description && <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>}
                    </td>
                    <td className="px-5 py-3">
                      {group.permissions.length === 0 ? (
                        <span className="text-gray-400">нет прав</span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {group.permissions.map(p => (
                            <span key={p} className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">
                              {PERMISSION_LABELS[p] || p}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {group.all_models ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700" title="Группа видит все модели здоровья">все модели</span>
                      ) : group.model_ids.length === 0 ? (
                        <span className="text-gray-400">нет доступа</span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {group.model_ids.map(id => (
                            <span key={id} className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
                              {models.find(m => m.rootId === id)?.rootName || `#${id}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {memberNames.length === 0 ? <span className="text-gray-400">—</span> : `${memberNames.length}: ${memberNames.join(', ')}`}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <button onClick={() => openEdit(group)}
                        className="text-blue-600 hover:text-blue-800 mr-3" title="Редактировать">
                        <i className="fas fa-edit"></i>
                      </button>
                      {!group.is_system && (
                        <button onClick={() => handleDelete(group)} className="text-red-500 hover:text-red-700" title="Удалить">
                          <i className="fas fa-trash"></i>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {groups.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Групп пока нет</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingId === null ? 'Новая группа' : 'Редактировать группу'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Permissions */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-700">Права группы</p>
                {PERMISSION_SECTIONS.map(section => (
                  <div key={section.title}>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1.5">{section.title}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {section.items.map(item => (
                        <label key={item.key} className="flex items-start gap-2 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" className="mt-0.5"
                            checked={form.permissions.includes(item.key)}
                            onChange={() => setForm(prev => ({
                              ...prev,
                              permissions: prev.permissions.includes(item.key)
                                ? prev.permissions.filter(p => p !== item.key)
                                : [...prev.permissions, item.key],
                            }))} />
                          <span>
                            <span className="block text-sm text-gray-800">{item.label}</span>
                            <span className="block text-xs text-gray-400">{item.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Область моделей здоровья: группа видит все модели или только отмеченные */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1.5">Модели здоровья</p>
                <label className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox"
                    checked={form.all_models}
                    onChange={() => setForm({ ...form, all_models: !form.all_models })} />
                  <span className="text-sm text-gray-800">Все модели здоровья</span>
                </label>
                {!form.all_models && (
                  models.length === 0 ? (
                    <p className="text-sm text-gray-400 mt-2">Модели не загружены — нужна синхронизация с Zabbix.</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 mt-2 mb-1">
                        Отметьте модели, которые видит группа ({form.model_ids.length} из {models.length}):
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {models.map(m => (
                          <label key={m.rootId} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox"
                              checked={form.model_ids.includes(m.rootId)}
                              onChange={() => toggleModel(m.rootId)} />
                            <span className="text-sm text-gray-800 truncate" title={m.rootName}>{m.rootName}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1.5">Участники</p>
                {users.length === 0 ? (
                  <p className="text-sm text-gray-400">Нет пользователей</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {users.map(u => (
                      <label key={u.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox"
                          checked={form.member_ids.includes(u.id)}
                          onChange={() => setForm(prev => ({
                            ...prev,
                            member_ids: prev.member_ids.includes(u.id)
                              ? prev.member_ids.filter(id => id !== u.id)
                              : [...prev.member_ids, u.id],
                          }))} />
                        <span className="text-sm text-gray-800">{u.username}</span>
                        {u.role === 'admin' && <span className="text-xs text-gray-400">(админ — группы не важны)</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200">Отмена</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}