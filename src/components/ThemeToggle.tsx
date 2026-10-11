import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { cn } from '../lib/cn';

interface ThemeToggleProps {
  /** Компактный вид для тёмной боковой панели. */
  variant?: 'sidebar' | 'plain';
  className?: string;
}

/** Переключатель светлой/тёмной темы (иконка солнце/луна). */
export default function ThemeToggle({ variant = 'plain', className }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-all duration-150 ease-standard',
        variant === 'sidebar'
          ? 'w-8 h-8 text-faint hover:text-white hover:bg-white/10'
          : 'w-9 h-9 text-muted hover:text-content hover:bg-surface-2 border border-line',
        className
      )}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
