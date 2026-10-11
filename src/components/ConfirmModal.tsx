import React from 'react';
import { AlertTriangle, AlertCircle, Info, type LucideIcon } from 'lucide-react';

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

  const typeStyles: Record<'danger' | 'warning' | 'info', { Icon: LucideIcon; iconColor: string; iconBg: string; buttonBg: string }> = {
    danger: {
      Icon: AlertTriangle,
      iconColor: 'text-danger-fg',
      iconBg: 'bg-danger-soft',
      buttonBg: 'bg-red-600 hover:bg-red-700',
    },
    warning: {
      Icon: AlertCircle,
      iconColor: 'text-warn-fg',
      iconBg: 'bg-warn-soft',
      buttonBg: 'bg-yellow-600 hover:bg-yellow-700',
    },
    info: {
      Icon: Info,
      iconColor: 'text-accent',
      iconBg: 'bg-accent-soft',
      buttonBg: 'bg-brand-600 hover:bg-brand-700',
    },
  };

  const style = typeStyles[type];
  const Icon = style.Icon;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md">
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
          <button
            onClick={onCancel}
            className="px-4 py-2 text-content hover:bg-surface-2 rounded-lg transition"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg transition ${style.buttonBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
