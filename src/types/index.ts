// Типы данных для SLA Planner

/** Роли: admin — полные права без групп; user — права приходят из групп. */
export type UserRole = 'admin' | 'user';

/** Краткая информация о группе (для отображения у пользователя). */
export interface UserGroup {
  id: number;
  name: string;
}

/** Область моделей здоровья пользователя (сумма областей его групп). */
export interface ModelScope {
  /** true — доступны все модели здоровья (admin или группа «все модели»). */
  all: boolean;
  /** rootId доступных моделей; пусто при all=true. */
  ids: string[];
}

export interface User {
  id: number;
  username: string;
  role: UserRole;
  /** Группы пользователя (для admin — пусто). */
  groups: UserGroup[];
  /** Итоговые права (для admin — весь каталог). */
  permissions: string[];
  /** Область доступных моделей здоровья. */
  models: ModelScope;
  is_active: boolean;
  created_at: string;
}

/** Группа (команда): набор прав + область моделей здоровья + состав участников. */
export interface Group {
  id: number;
  name: string;
  description: string;
  permissions: string[];
  /** Видит все модели здоровья. */
  all_models: boolean;
  /** rootId доступных моделей при all_models=false. */
  model_ids: string[];
  is_system: boolean;
  member_ids: number[];
  created_at?: string;
}

export interface SLA {
  id: number;
  zabbix_slaid: string;
  name: string;
  slo: number;
  schedule_type: '24x7' | 'custom';
  schedule_json?: string;
  synced_at: string;
  service_tags?: string[];
}

export interface Service {
  id: number;
  zabbix_serviceid: string;
  name: string;
  parent_zabbix_serviceid?: string;
  algorithm: string;
  sortorder: number;
  status: number;
  tags: { tag: string; value: string }[];
  synced_at: string;
}

/** Родитель/ребёнок услуги из живой конфигурации Zabbix. */
export interface ServiceConfigLink {
  serviceid: string;
  name: string;
  status: number;
}

/** Тег проблемы услуги (problem tag). */
export interface ServiceProblemTag {
  tag: string;
  operator: string;
  operator_label: string;
  value: string;
}

/** Живая конфигурация услуги из Zabbix (для страницы «Услуги»). */
export interface ServiceConfig {
  serviceid: string;
  name: string;
  description: string;
  algorithm: number;
  algorithm_label: string;
  status: number;
  status_label: string;
  sortorder: number;
  weight: number;
  propagation_rule: number;
  propagation_rule_label: string;
  propagation_value: number;
  created_at: string | null;
  readonly: boolean;
  tags: { tag: string; value: string }[];
  problem_tags: ServiceProblemTag[];
  parents: ServiceConfigLink[];
  children: ServiceConfigLink[];
}

export type WorkStatus = 'draft' | 'planned' | 'active' | 'done' | 'cancelled' | 'sync_error';

export interface PlannedWork {
  id: number;
  title: string;
  description: string;
  service_id: number;
  sla_id: number;
  started_at: string;
  ended_at: string;
  status: WorkStatus;
  series_id?: number | null;
  downtime_marker: string;
  downtime_period_from: number;
  downtime_period_to: number;
  sync_error?: string;
  created_by: number;
  updated_by: number;
  created_at: string;
  updated_at: string;
  service_name?: string;
  sla_name?: string;
}

export interface WorkSeries {
  id: number;
  title: string;
  description: string;
  service_id: number;
  sla_id: number;
  weekdays: number[];      // 0=Пн .. 6=Вс
  start_time: string;      // "HH:MM" (МСК)
  duration_minutes: number;
  active: boolean;
  occurrence_count: number;
  created_at: string;
  service_name?: string;
  sla_name?: string;
}

export interface AuditLogEntry {
  id: number;
  user_id: number;
  username: string;
  action: string;
  entity_type: string;
  entity_id: number;
  payload: Record<string, unknown>;
  result: 'ok' | 'error';
  created_at: string;
}

export interface ExcludedDowntime {
  name: string;
  period_from: string;
  period_to: string;
}

export interface ZabbixSLA {
  slaid: string;
  name: string;
  slo: string;
  period: string;
  timezone: string;
  effective_date: string;
  status: string;
  service_tags: string[];
  excluded_downtimes: ExcludedDowntime[];
}

export interface ZabbixService {
  serviceid: string;
  name: string;
  algorithm: string;
  sortorder: string;
  status: string;
  tags: { tag: string; value: string }[];
}

/** Результат полного синка Zabbix (см. GET /api/sync/status при status=ok). */
export interface SyncResult {
  slas: number;
  services: number;
  links: number;
}

/** Статус автосинхронизации по расписанию (поле scheduler в SyncStatus). */
export interface SyncScheduler {
  enabled: boolean;
  interval_minutes: number;
  next_run_at: string | null;
}

/** Статус фонового полного синка. */
export interface SyncStatus {
  /** idle | running | ok | error | skipped */
  status: 'idle' | 'running' | 'ok' | 'error' | 'skipped';
  started_at: string | null;
  finished_at: string | null;
  result: SyncResult | null;
  error: string | null;
  scheduler: SyncScheduler;
}

/** Цвета узлов графа: базовые (по типам) + индивидуальные цвета узлов модели. */
export interface GraphColors {
  /** Базовый цвет узлов SLA (по умолчанию для непокрашенных). */
  sla: string;
  /** Базовый цвет узлов услуг (по умолчанию для непокрашенных). */
  service: string;
  /** Индивидуальные цвета узлов: node_key ("svc:..." | "sla:...") → "#RRGGBB". */
  nodes: Record<string, string>;
}
