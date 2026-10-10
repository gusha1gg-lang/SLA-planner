import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Group, User, UserRole } from '../types';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../time';

const roleColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  user: 'bg-blue-100 text-blue-700',
};

const roleLabels: Record<string, string> = {
  admin: 'администратор',
  user: 'пользователь',
};

interface UserForm {
  username: string;
  password: string;
  role: UserRole;
  group_ids: number[];
  is_active: boolean;
}

const emptyForm: UserForm = { username: '', password: '', role: 'user', group_ids: [], is_active: true };

export default function UsersPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [u, g] = await Promise.all([api.getUsers(), api.getGroups()]);
      setUsers(u);
      setGroups(g);
    } catch (err: any) {
      showToast('error', 'Не удалось загрузить пользователей: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (user: User) => {
    setEditingId(user.id);
    setForm({
      username: user.username,
      password: '',
      role: user.role,
      group_ids: user.groups.map(g => g.id),
      is_active: user.is_active,
    });
    setShowModal(true);
  };

  const toggleGroup = (groupId: number) => {
    setForm(prev => ({
      ...prev,
      group_ids: prev.group_ids.includes(groupId)
        ? prev.group_ids.filter(id => id !== groupId)
        : [...prev.group_ids, groupId],
    }));
  };

  const handleSave = async () => {
    if (!form.username.trim()) { showToast('error', 'Укажите имя пользователя'); return; }
    if (editingId === null && !form.password) { showToast('error', 'Укажите пароль'); return; }

    setSaving(true);
    try {
      if (editingId === null) {
        await api.createUser({
          username: form.username.trim(),
          password: form.password,
          role: form.role,
          group_ids: form.group_ids,
        });
        showToast('success', 'Пользователь создан');
      } else {
        await api.updateUser(editingId, {
          role: form.role,
          is_active: form.is_active,
          group_ids: form.group_ids,
          ...(form.password ? { password: form.password } : {}),
        });
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

  const toggleActive = async (user: User) => {
    try {
      await api.updateUser(user.id, { is_active: !user.is_active });
      await loadData();
    } catch (err: any) {
      showToast('error', 'Ошибка: ' + err.message);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-blue-600"></i></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Пользователи</h1>
        <p className="text-gray-500 mt-1">Учётные записи и членство в группах. Права определяются группами.</p>
      </div>

      {/* Role descriptions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleColors.admin}`}>администратор</span>
          <p className="text-sm text-gray-600 mt-2">Полные права без групп: синхронизация, граф, работы, пользователи и группы, настройки.</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleColors.user}`}>пользователь</span>
          <p className="text-sm text-gray-600 mt-2">Права = сумма прав групп, в которых состоит пользователь (как команды в Grafana).</p>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Список пользователей</h2>
          <button onClick={openCreate}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <i className="fas fa-user-plus mr-2"></i>Добавить
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Пользователь</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Роль</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Группы</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Статус</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Создан</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                        <i className="fas fa-user text-slate-500 text-xs"></i>
                      </div>
                      <span className="font-medium">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[user.role] || roleColors.user}`}>
                      {roleLabels[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {user.role === 'admin' ? (
                      <span className="text-gray-400">— (полные права)</span>
                    ) : user.groups.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.groups.map(g => (
                          <span key={g.id} className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">{g.name}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">без групп</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {user.is_active ? 'Активен' : 'Заблокирован'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{formatDate(user.created_at)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => openEdit(user)} className="text-blue-600 hover:text-blue-800 text-sm mr-3" title="Редактировать">
                      <i className="fas fa-edit"></i>
                    </button>
                    {user.role !== 'admin' && (
                      <button onClick={() => toggleActive(user)}
                        className={user.is_active ? 'text-red-500 hover:text-red-700 text-sm' : 'text-green-600 hover:text-green-800 text-sm'}
                        title={user.is_active ? 'Заблокировать' : 'Разблокировать'}>
                        <i className={`fas ${user.is_active ? 'fa-ban' : 'fa-check'}`}></i>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingId === null ? 'Новый пользователь' : 'Редактировать пользователя'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Имя пользователя</label>
                <input value={form.username} disabled={editingId !== null}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Пароль {editingId !== null && <span className="text-gray-400 font-normal">(пусто — не менять)</span>}
                </label>
                <input type="password" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Роль</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="user">пользователь (права из групп)</option>
                  <option value="admin">администратор (полные права)</option>
                </select>
              </div>

              {form.role === 'user' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Группы</label>
                  {groups.length === 0 ? (
                    <p className="text-sm text-gray-400">Групп пока нет — создайте их на странице «Группы».</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                      {groups.map(g => (
                        <label key={g.id} className="flex items-start gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={form.group_ids.includes(g.id)} onChange={() => toggleGroup(g.id)}
                            className="mt-0.5" />
                          <span>
                            <span className="font-medium text-gray-800">{g.name}</span>
                            {g.description && <span className="text-gray-500"> — {g.description}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {editingId !== null && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                  Активен (снятие — блокировка входа)
                </label>
              )}
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