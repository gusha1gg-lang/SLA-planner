import React, { useEffect, useRef, useState } from 'react';
import { Ban, Check, Loader2, Pencil, User as UserIcon, UserPlus, X } from 'lucide-react';
import { api } from '../api/client';
import { User, UserRole } from '../types';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../time';
import Button from '../components/ui/Button';
import { useModalA11y } from '../hooks/useModalA11y';

const roleColors: Record<string, string> = {
  admin: 'bg-danger-soft text-danger-fg',
  user: 'bg-accent-soft text-accent',
};

const roleLabels: Record<string, string> = {
  admin: 'администратор',
  user: 'пользователь',
};

interface UserForm {
  username: string;
  password: string;
  role: UserRole;
  is_active: boolean;
}

const emptyForm: UserForm = { username: '', password: '', role: 'user', is_active: true };

export default function UsersPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Esc / клик по фону / фокус-трап для окна пользователя.
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(showModal, modalRef, () => setShowModal(false));

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setUsers(await api.getUsers());
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
    setForm({ username: user.username, password: '', role: user.role, is_active: user.is_active });
    setShowModal(true);
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
        });
        showToast('success', 'Пользователь создан');
      } else {
        await api.updateUser(editingId, {
          role: form.role,
          is_active: form.is_active,
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
    return <div className="flex items-center justify-center h-64"><Loader2 className="text-3xl text-accent animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content">Пользователи</h1>
        <p className="text-muted mt-1">Учётные записи. Права и состав групп настраиваются на странице «Группы».</p>
      </div>

      {/* Role descriptions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface rounded-xl p-4 shadow-card border border-line">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleColors.admin}`}>администратор</span>
          <p className="text-sm text-muted mt-2">Полные права без групп: синхронизация, граф, работы, пользователи и группы, настройки.</p>
        </div>
        <div className="bg-surface rounded-xl p-4 shadow-card border border-line">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleColors.user}`}>пользователь</span>
          <p className="text-sm text-muted mt-2">Права = сумма прав групп, в которых состоит пользователь (как команды в Grafana).</p>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-surface rounded-xl shadow-card border border-line overflow-hidden">
        <div className="p-5 border-b border-line flex items-center justify-between">
          <h2 className="text-lg font-semibold">Список пользователей</h2>
          <Button icon={UserPlus} onClick={openCreate}>
            Добавить
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-muted">Пользователь</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Роль</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Группы</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Статус</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Создан</th>
                <th className="text-left px-5 py-3 font-medium text-muted">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-surface-2">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-line flex items-center justify-center">
                        <UserIcon className="text-muted text-xs" />
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
                      <span className="text-faint">— (полные права)</span>
                    ) : user.groups.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.groups.map(g => (
                          <span key={g.id} className="px-2 py-0.5 rounded-full text-xs bg-surface-2 text-content">{g.name}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-faint">без групп</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${user.is_active ? 'bg-ok-soft text-ok-fg' : 'bg-surface-2 text-muted'}`}>
                      {user.is_active ? 'Активен' : 'Заблокирован'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted">{formatDate(user.created_at)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => openEdit(user)} className="text-accent hover:text-accent text-sm mr-3 transition-colors" title="Редактировать">
                      <Pencil />
                    </button>
                    {user.role !== 'admin' && (
                      <button onClick={() => toggleActive(user)}
                        className={user.is_active ? 'text-danger-fg hover:text-danger-fg text-sm transition-colors' : 'text-ok-fg hover:text-ok-fg text-sm transition-colors'}
                        title={user.is_active ? 'Заблокировать' : 'Разблокировать'}>
                        {user.is_active ? <Ban /> : <Check />}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-overlay-in" onClick={() => setShowModal(false)}>
          <div
            ref={modalRef}
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
            className="bg-surface rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in outline-none"
          >
            <div className="p-5 border-b border-line flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingId === null ? 'Новый пользователь' : 'Редактировать пользователя'}</h2>
              <button onClick={() => setShowModal(false)} className="text-faint hover:text-muted transition-colors" title="Закрыть"><X /></button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-content mb-1">Имя пользователя</label>
                <input value={form.username} disabled={editingId !== null}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  className="w-full border border-line-strong rounded-lg px-3 py-2 text-sm disabled:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-content mb-1">
                  Пароль {editingId !== null && <span className="text-faint font-normal">(пусто — не менять)</span>}
                </label>
                <input type="password" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-line-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-content mb-1">Роль</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
                  className="w-full border border-line-strong rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="user">пользователь (права из групп)</option>
                  <option value="admin">администратор (полные права)</option>
                </select>
              </div>

              {form.role === 'user' && (
                <p className="text-sm text-muted bg-surface-2 border border-line rounded-lg px-3 py-2">
                  Состав групп задаётся на странице «Группы» — там же определяются права и доступные
                  модели здоровья. Новый пользователь создаётся без групп.
                </p>
              )}

              {editingId !== null && (
                <label className="flex items-center gap-2 text-sm text-content">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                  Активен (снятие — блокировка входа)
                </label>
              )}
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