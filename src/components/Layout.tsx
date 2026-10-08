import React from 'react';
import { useAuth } from '../context/AuthContext';
import StatusBar from './StatusBar';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  onSync?: () => void;
}

export default function Layout({ children, currentPage, onNavigate, onSync }: LayoutProps) {
  const { user, logout, hasRole } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Дашборд', icon: 'fa-chart-line', roles: ['admin', 'planner', 'viewer'] },
    { id: 'graph', label: 'Граф SLA', icon: 'fa-project-diagram', roles: ['admin', 'planner', 'viewer'] },
    { id: 'works', label: 'Плановые работы', icon: 'fa-calendar-alt', roles: ['admin', 'planner', 'viewer'] },
    { id: 'report', label: 'SLA-отчёт', icon: 'fa-chart-bar', roles: ['admin', 'planner', 'viewer'] },
    { id: 'audit', label: 'Аудит-лог', icon: 'fa-history', roles: ['admin'] },
    { id: 'users', label: 'Пользователи', icon: 'fa-users-cog', roles: ['admin'] },
    { id: 'settings', label: 'Настройки', icon: 'fa-cog', roles: ['admin'] },
  ];

  const roleBadge: Record<string, string> = {
    admin: 'bg-red-100 text-red-700',
    planner: 'bg-blue-100 text-blue-700',
    viewer: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full">
        <div className="p-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <i className="fas fa-calendar-check text-white"></i>
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">SLA Planner</h1>
              <p className="text-xs text-slate-400">v0.1.0</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.filter(item => hasRole(item.roles as any[])).map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                currentPage === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <i className={`fas ${item.icon} w-5 text-center`}></i>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
              <i className="fas fa-user text-sm"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.username}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadge[user?.role || 'viewer']}`}>
                {user?.role}
              </span>
            </div>
            <button onClick={logout} className="text-slate-400 hover:text-white" title="Выйти">
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64">
        <StatusBar onSync={onSync} />
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
