/**
 * Навигация портала: единый список пунктов меню (используется в Layout) и правила
 * доступа к страницам (используются при восстановлении маршрута из URL).
 *
 * Маршрут хранится в hash URL (`#/graph`, `#/sla-detail?id=798`) — благодаря этому
 * перезагрузка (F5), закладки и кнопки «назад/вперёд» браузера оставляют пользователя
 * на текущей странице (раньше состояние жило только в React-состоянии и сбрасывалось).
 */
import { PERMISSIONS } from './permissions';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  /** Требуемое право (страница). */
  permission?: string;
  /** Только для роли admin (управление пользователями/группами/настройками). */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Дашборд', icon: 'fas fa-tachometer-alt', permission: PERMISSIONS.dashboard },
  { id: 'graph', label: 'Модель здоровья', icon: 'fas fa-project-diagram', permission: PERMISSIONS.model },
  { id: 'works', label: 'Плановые работы', icon: 'fas fa-calendar-alt', permission: PERMISSIONS.works },
  { id: 'report', label: 'SLA-отчёт', icon: 'fas fa-chart-bar', permission: PERMISSIONS.reports },
  { id: 'audit', label: 'Аудит-лог', icon: 'fas fa-history', permission: PERMISSIONS.audit },
  { id: 'users', label: 'Пользователи', icon: 'fas fa-users-cog', adminOnly: true },
  { id: 'groups', label: 'Группы', icon: 'fas fa-user-friends', adminOnly: true },
  { id: 'settings', label: 'Настройки', icon: 'fas fa-cog', adminOnly: true },
];

const PAGE_BY_ID = new Map(NAV_ITEMS.map(item => [item.id, item]));

export interface Route {
  page: string;
  params: Record<string, string>;
}

/**
 * Доступна ли страница пользователю. `sla-detail` (детали SLA) открывается с дашборда
 * и «Модели здоровья», отдельного права не имеет.
 */
export function isPageAllowed(page: string, can: (permission: string) => boolean, isAdmin: boolean): boolean {
  if (page === 'sla-detail') {
    return can(PERMISSIONS.dashboard) || can(PERMISSIONS.model) || can(PERMISSIONS.reports);
  }
  const item = PAGE_BY_ID.get(page);
  if (!item) return false;
  if (item.adminOnly) return isAdmin;
  return item.permission ? can(item.permission) : false;
}

/** Прочитать маршрут из `window.location.hash` (`#/works`, `#/sla-detail?id=798`). */
export function readRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [page, query = ''] = raw.split('?');
  const params: Record<string, string> = {};
  new URLSearchParams(query).forEach((value, key) => {
    params[key] = value;
  });
  return { page: page || 'dashboard', params };
}

/** Собрать hash для маршрута. */
export function buildHash(page: string, params?: Record<string, string>): string {
  const query = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
  return `#/${page}${query}`;
}
