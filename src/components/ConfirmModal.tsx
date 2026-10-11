import React from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import Button from './ui/Button';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  type = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const typeStyles: Record<
    'danger' | 'warning' | 'info',
    { Icon: typeof AlertTriangle; iconColor: string; iconBg: string; variant: 'danger' | 'warning' | 'primary' }
  > = {
    danger: {
      Icon: AlertTriangle,
      iconColor: 'text-danger-fg',
      iconBg: 'bg-danger-soft',
      variant: 'danger',
    },
    warning: {
      Icon: AlertCircle,
      iconColor: 'text-warn-fg',
      iconBg: 'bg-warn-soft',
      variant: 'warning',
    },
    info: {
      Icon: Info,
      iconColor: 'text-accent',
      iconBg: 'bg-accent-soft',
      variant: 'primary',
    },
  };

  const style = typeStyles[type];
  const Icon = style.Icon;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-overlay-in">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md animate-scale-in">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full ${style.iconBg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`${style.iconColor} text-xl`} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-content mb-2">{title}</h3>
              <p className="text-muted text-sm">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-surface-2 rounded-b-xl flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={style.variant} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
