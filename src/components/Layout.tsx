import React from 'react';
import { useAuth } from '../context/AuthContext';
import { NAV_ITEMS } from '../navigation';
import StatusBar from './StatusBar';

interface LayoutProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onSync?: () => void;
  children: React.ReactNode;
}

export default function Layout({ currentPage, onNavigate, onSync, children }: LayoutProps) {
  const { user, logout, can, isAdmin } = useAuth();

  const visibleItems = NAV_ITEMS.filter(item =>
    item.adminOnly ? isAdmin : (item.permission ? can(item.permission) : false)
  );

  const roleBadge: Record<string, string> = {
    admin: 'bg-red-100 text-red-700',
    user: 'bg-blue-100 text-blue-200',
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
          {visibleItems.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                currentPage === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <i className={`${item.icon} w-5 text-center`}></i>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
              <i className="fas fa-user text-sm"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.username}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadge[user?.role || 'user']}`}>
                {user?.role === 'admin' ? 'администратор' : 'пользователь'}
              </span>
              {user?.role === 'user' && (
                <p className="text-[11px] text-slate-400 mt-1 truncate" title={user.groups.map(g => g.name).join(', ')}>
                  {user.groups.length > 0 ? user.groups.map(g => g.name).join(', ') : 'без групп'}
                </p>
              )}
            </div>
            <button onClick={logout} className="text-slate-400 hover:text-white shrink-0" title="Выйти">
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