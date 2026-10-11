import React from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Показать спиннер и заблокировать кнопку. */
  loading?: boolean;
  /** Иконка слева. */
  icon?: LucideIcon;
  /** Иконка справа (например, стрелка «вперёд»). */
  iconRight?: LucideIcon;
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg select-none ' +
  'transition-all duration-150 ease-standard ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-1 ' +
  'disabled:opacity-50 disabled:pointer-events-none';

// Микро-интеракции: подсветка фона + лёгкий подъём на hover, «вжатие» на active.
const variants: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-xs hover:bg-brand-700 hover:shadow-card hover:-translate-y-px active:translate-y-0 active:bg-brand-800',
  secondary:
    'bg-surface text-content border border-line hover:border-line-strong hover:bg-surface-2 hover:-translate-y-px hover:shadow-xs active:translate-y-0',
  ghost: 'text-muted hover:bg-surface-2 hover:text-content',
  danger:
    'bg-red-600 text-white shadow-xs hover:bg-red-700 hover:shadow-card hover:-translate-y-px active:translate-y-0 active:bg-red-800',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
};

const iconSizes: Record<Size, number> = { sm: 15, md: 17 };

/**
 * Базовая кнопка портала. Единые состояния (hover/active/focus/disabled)
 * и единый акцент — чтобы кнопки везде «двигались» одинаково.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  iconRight: IconRight,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {loading ? (
        <Loader2 className="animate-spin" size={16} />
      ) : (
        Icon && <Icon size={16} />
      )}
      {children}
      {IconRight && <IconRight size={16} />}
    </button>
  );
}
