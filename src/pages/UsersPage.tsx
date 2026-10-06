import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { User } from '../types';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } finally { setLoading(false); }
  };

  const roleColors: Record<string, string> = {
    admin: 'bg-red-100 text-red-700',
    planner: 'bg-blue-100 text-blue-700',
    viewer: 'bg-gray-100 text-gray-700',
  };

  const roleDescriptions: Record<string, string> = {
    admin: 'Полный доступ: управление пользователями, создание работ, синхронизация',
    planner: 'Создание и управление плановыми работами, push в Zabbix',
    viewer: 'Только просмотр: дашборд, граф, отчёты',
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-blue-600"></i></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Пользователи</h1>
        <p className="text-gray-500 mt-1">Управление учётными записями и ролями</p>
      </div>

      {/* Role descriptions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(roleDescriptions).map(([role, desc]) => (
          <div key={role} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[role]}`}>{role}</span>
            <p className="text-sm text-gray-600 mt-2">{desc}</p>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Список пользователей</h2>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <i className="fas fa-user-plus mr-2"></i>Добавить
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Пользователь</th>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Роль</th>
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
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[user.role]}`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {user.is_active ? 'Активен' : 'Заблокирован'}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-600">{new Date(user.created_at).toLocaleDateString('ru-RU')}</td>
                <td className="px-5 py-3">
                  <button className="text-blue-600 hover:text-blue-800 text-sm mr-3"><i className="fas fa-edit"></i></button>
                  <button className="text-red-500 hover:text-red-700 text-sm"><i className="fas fa-ban"></i></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
