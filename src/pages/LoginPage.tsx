import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || 'Ошибка входа');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
            <i className="fas fa-calendar-check text-blue-600 text-2xl"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">SLA Planner</h1>
          <p className="text-gray-500 mt-1">Планировщик плановых работ</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Логин</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="admin / planner / viewer"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Пароль"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 font-medium mb-2">Доступные аккаунты:</p>
          <div className="text-xs text-gray-600 space-y-1">
            <p><span className="font-mono bg-gray-200 px-1.5 py-0.5 rounded">admin</span> / <span className="font-mono bg-gray-200 px-1.5 py-0.5 rounded">admin123</span> — полный доступ</p>
            <p><span className="font-mono bg-gray-200 px-1.5 py-0.5 rounded">planner</span> / <span className="font-mono bg-gray-200 px-1.5 py-0.5 rounded">planner123</span> — создание работ</p>
            <p><span className="font-mono bg-gray-200 px-1.5 py-0.5 rounded">viewer</span> / <span className="font-mono bg-gray-200 px-1.5 py-0.5 rounded">viewer123</span> — только просмотр</p>
          </div>
        </div>
      </div>
    </div>
  );
}
