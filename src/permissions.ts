/**
 * Каталог прав (зеркало backend app/permissions.py).
 *
 * Роли: admin — полные права без групп; user — права = сумма прав групп.
 * Права делятся на «страницы» (что видеть) и «действия» (что делать).
 */

export const PERMISSIONS = {
  // ── Страницы ──
  dashboard: 'dashboard',
  model: 'model',
  works: 'works',
  reports: 'reports',
  audit: 'audit',
  // ── Действия ──
  worksEdit: 'works.edit',
  worksDelete: 'works.delete',
  slaEdit: 'sla.edit',
  graphEdit: 'graph.edit',
  sync: 'sync.run',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionMeta {
  key: string;
  label: string;
  description: string;
}

/** Группы прав для формы редактирования группы. */
export const PERMISSION_SECTIONS: { title: string; items: PermissionMeta[] }[] = [
  {
    title: 'Страницы (что видеть)',
    items: [
      { key: PERMISSIONS.dashboard, label: 'Дашборд', description: 'Обзор: SLA, услуги, последние работы' },
      { key: PERMISSIONS.model, label: 'Модель здоровья', description: 'Граф и дерево модели, детали узлов' },
      { key: PERMISSIONS.works, label: 'Плановые работы', description: 'Просмотр списка и календаря работ' },
      { key: PERMISSIONS.reports, label: 'SLA-отчёт', description: 'Отчёт по SLA' },
      { key: PERMISSIONS.audit, label: 'Аудит-лог', description: 'Журнал действий (по умолчанию только admin)' },
    ],
  },
  {
    title: 'Действия (что делать)',
    items: [
      { key: PERMISSIONS.worksEdit, label: 'Работы: создание/редактирование', description: 'Создание, правка и push работ в Zabbix' },
      { key: PERMISSIONS.worksDelete, label: 'Работы: удаление', description: 'Удаление плановых работ' },
      { key: PERMISSIONS.slaEdit, label: 'Исключения простоя SLA', description: 'Добавление и удаление окон простоя' },
      { key: PERMISSIONS.graphEdit, label: 'Граф: редактирование', description: 'Раскладка узлов и цвета графа' },
      { key: PERMISSIONS.sync, label: 'Синхр. с Zabbix', description: 'Полная синхронизация данных' },
    ],
  },
];

/** Плоский словарь подпись по ключу права. */
export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_SECTIONS.flatMap(s => s.items.map(i => [i.key, i.label]))
);