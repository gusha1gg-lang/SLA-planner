import React, { useState } from 'react';
import { LogOut, User as UserIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NAV_ITEMS } from '../navigation';
import { cn } from '../lib/cn';
import BrandMark from './BrandMark';
import StatusBar from './StatusBar';
import ThemeToggle from './ThemeToggle';

interface LayoutProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onSync?: () => void;
  children: React.ReactNode;
}

/** Ключ localStorage для состояния бокового меню. */
const SIDEBAR_KEY = 'sla_sidebar';

export default function Layout({ currentPage, onNavigate, onSync, children }: LayoutProps) {
  const { user, logout, can, isAdmin } = useAuth();

  // Свёрнутое меню (только иконки) ↔ закреплённое полное (как было). Выбор помним.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded');
      } catch {
        /* localStorage может быть недоступен — не критично */
      }
      return next;
    });
  };

  const visibleItems = NAV_ITEMS.filter(item =>
    item.adminOnly ? isAdmin : (item.permission ? can(item.permission) : false)
  );

  const roleLabel = user?.role === 'admin' ? 'администратор' : 'пользователь';

  return (
    <div className="min-h-screen flex bg-canvas">
      {/* Боковая панель — графитовая основа портала. Свёрнутая — только иконки. */}
      <aside
        className={cn(
          'bg-slate-900 text-white flex flex-col fixed h-full z-20 border-r border-black/20',
          'transition-[width] duration-200 ease-standard',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className={cn('border-b border-white/5', collapsed ? 'px-2 py-4' : 'px-4 py-4')}>
          <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
            <BrandMark className={cn('shrink-0 shadow-card', collapsed ? 'w-9 h-9' : 'w-10 h-10')} />
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="font-semibold text-[15px] leading-tight tracking-tight">SLA Planner</h1>
                <p className="text-[11px] text-slate-400">ОМК-ИТ · планирование работ</p>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleItems.map(item => {
            const active = currentPage === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'group relative w-full flex items-center gap-3 rounded-lg text-sm',
                  'transition-all duration-150 ease-standard',
                  collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
                  active
                    ? 'bg-brand-500/15 text-white font-medium'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                )}
              >
                {/* Акцентная полоса активного пункта. */}
                <span
                  className={cn(
                    'absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-brand-400',
                    'transition-all duration-200 ease-standard',
                    active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'
                  )}
                />
                <Icon className={cn('w-[18px] h-[18px] shrink-0 transition-colors', active ? 'text-brand-300' : 'text-slate-400 group-hover:text-white')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-1">
          <div className={cn('flex items-center gap-3 rounded-lg p-2', collapsed ? 'justify-center' : 'hover:bg-white/5 transition-colors duration-150')}>
            <div
              className="w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/10 flex items-center justify-center shrink-0"
              title={user?.username}
            >
              <UserIcon className="w-4 h-4 text-slate-200" />
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user?.username}</p>
                  <span
                    className={cn(
                      'inline-block mt-0.5 text-[11px] px-2 py-0.5 rounded-full',
                      user?.role === 'admin' ? 'bg-brand-500/20 text-brand-200' : 'bg-white/10 text-slate-300'
                    )}
                  >
                    {roleLabel}
                  </span>
                  {user?.role === 'user' && (
                    <p
                      className="text-[11px] text-slate-400 mt-1 truncate"
                      title={user.groups.map(g => g.name).join(', ')}
                    >
                      {user.groups.length > 0 ? user.groups.map(g => g.name).join(', ') : 'без групп'}
                    </p>
                  )}
                </div>
                <ThemeToggle variant="sidebar" />
                <button
                  onClick={logout}
                  className="text-slate-400 hover:text-white shrink-0 p-1 rounded-md hover:bg-white/10 transition-colors"
                  title="Выйти"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Свёрнутый вид: те же действия — иконками в столбик. */}
          {collapsed && (
            <div className="flex flex-col items-center gap-1">
              <ThemeToggle variant="sidebar" />
              <button
                onClick={logout}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded-md hover:bg-white/10 transition-colors"
                title="Выйти"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Свернуть / развернуть меню («закрепить» в полный вид). */}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            className={cn(
              'w-full flex items-center gap-3 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-colors duration-150',
              collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2'
            )}
          >
            {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
            {!collapsed && <span className="text-sm">Свернуть меню</span>}
          </button>
        </div>
      </aside>

      {/* Основная область */}
      <main className={cn('flex-1 transition-[margin] duration-200 ease-standard', collapsed ? 'ml-16' : 'ml-64')}>
        <StatusBar onSync={onSync} />
        {/* key={currentPage} — при смене страницы контент появляется заново (анимация). */}
        <div key={currentPage} className="p-6 animate-fade-in-up">{children}</div>
      </main>
    </div>
  );
}
