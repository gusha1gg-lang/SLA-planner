import React, { useState } from 'react';
import { CalendarDays, LayoutDashboard, Network, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandMark from '../components/BrandMark';
import Button from '../components/ui/Button';
import ThemeToggle from '../components/ThemeToggle';

const FEATURES = [
  { icon: Network, text: 'Модель здоровья сервисов и связи услуг' },
  { icon: CalendarDays, text: 'Календарь плановых работ и согласование' },
  { icon: ShieldCheck, text: 'Контроль SLA и отчётность по нарушениям' },
];

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

  const inputClass =
    'w-full h-10 px-3.5 rounded-lg border border-line bg-surface text-sm text-content ' +
    'placeholder:text-faint outline-none transition-all duration-150 ease-standard ' +
    'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      {/* Брендовая панель (только на широких экранах). */}
      <aside className="relative hidden lg:flex flex-col justify-between bg-slate-950 p-12 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '38px 38px',
          }}
        />
        <div className="absolute -top-28 -left-28 w-[28rem] h-[28rem] rounded-full bg-brand-600/25 blur-3xl" />
        <div className="absolute -bottom-32 right-0 w-96 h-96 rounded-full bg-brand-800/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <BrandMark className="w-11 h-11" />
          <div>
            <h1 className="text-white font-semibold text-lg leading-tight">SLA Planner</h1>
            <p className="text-slate-400 text-xs tracking-wide">ОМК-ИТ</p>
          </div>
        </div>

        <div className="relative max-w-md animate-fade-in-up">
          <h2 className="text-3xl font-semibold text-white leading-snug">
            Планирование работ с учётом SLA-контрактов
          </h2>
          <p className="text-slate-400 mt-4 text-sm leading-relaxed">
            Единый портал для планирования плановых работ на промышленных площадках и контроля
            доступности сервисов.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map(f => {
              const Icon = f.icon;
              return (
                <li key={f.text} className="flex items-center gap-3 text-sm text-slate-300">
                  <span className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-brand-300" />
                  </span>
                  {f.text}
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">© ОМК-ИТ · внутренний портал</p>
      </aside>

      {/* Форма входа. */}
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <BrandMark className="w-10 h-10" />
            <div>
              <p className="font-semibold text-lg leading-tight text-content">SLA Planner</p>
              <p className="text-muted text-xs">ОМК-ИТ</p>
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-line shadow-card p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-content">Вход в портал</h2>
              <p className="text-sm text-muted mt-1">Введите учётные данные, выданные администратором</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-danger-soft border border-danger-line text-danger-fg px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-content mb-1.5" htmlFor="username">
                  Логин
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className={inputClass}
                  placeholder="admin / planner / viewer"
                  autoComplete="username"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content mb-1.5" htmlFor="password">
                  Пароль
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Пароль"
                  autoComplete="current-password"
                  required
                />
              </div>

              <Button type="submit" loading={loading} icon={LayoutDashboard} className="w-full">
                {loading ? 'Вход…' : 'Войти'}
              </Button>
            </form>
          </div>

          <div className="mt-5 p-4 bg-surface-2 border border-line rounded-xl">
            <p className="text-xs text-muted font-medium mb-2">Тестовые учётные записи</p>
            <div className="text-xs text-muted space-y-1">
              <p><span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-line">admin</span> / <span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-line">admin123</span> — полный доступ</p>
              <p><span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-line">planner</span> / <span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-line">planner123</span> — создание работ</p>
              <p><span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-line">viewer</span> / <span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-line">viewer123</span> — только просмотр</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
