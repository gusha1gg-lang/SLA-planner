import { User, SLA, Service, PlannedWork, AuditLogEntry } from '../types';

export const mockUsers: User[] = [
  { id: 1, username: 'admin', role: 'admin', is_active: true, created_at: '2024-01-01T00:00:00Z' },
  { id: 2, username: 'planner1', role: 'planner', is_active: true, created_at: '2024-01-15T00:00:00Z' },
  { id: 3, username: 'viewer1', role: 'viewer', is_active: true, created_at: '2024-02-01T00:00:00Z' },
];

export const mockSLAs: SLA[] = [
  { id: 1, zabbix_slaid: '1', name: 'ABH HANA', slo: 99.9, schedule_type: '24x7', synced_at: '2024-03-01T10:00:00Z', service_tags: ['ABH_HANA'] },
  { id: 2, zabbix_slaid: '2', name: 'Core Banking', slo: 99.95, schedule_type: '24x7', synced_at: '2024-03-01T10:00:00Z', service_tags: ['CORE_BANKING'] },
  { id: 3, zabbix_slaid: '3', name: 'Payment Gateway', slo: 99.9, schedule_type: '24x7', synced_at: '2024-03-01T10:00:00Z', service_tags: ['PAYMENT_GW'] },
  { id: 4, zabbix_slaid: '4', name: 'CRM System', slo: 99.5, schedule_type: 'custom', synced_at: '2024-03-01T10:00:00Z', service_tags: ['CRM'] },
];

export const mockServices: Service[] = [
  { id: 1, zabbix_serviceid: '1', name: 'ABH HANA 1', algorithm: '0', sortorder: 0, status: 0, tags: [{ tag: 'service', value: 'ABH_HANA' }], synced_at: '2024-03-01T10:00:00Z' },
  { id: 2, zabbix_serviceid: '2', name: 'ABH HANA 2', parent_zabbix_serviceid: '1', algorithm: '0', sortorder: 1, status: 0, tags: [{ tag: 'service', value: 'ABH_HANA' }], synced_at: '2024-03-01T10:00:00Z' },
  { id: 3, zabbix_serviceid: '3', name: 'Core DB Primary', algorithm: '0', sortorder: 0, status: 0, tags: [{ tag: 'service', value: 'CORE_BANKING' }], synced_at: '2024-03-01T10:00:00Z' },
  { id: 4, zabbix_serviceid: '4', name: 'Core DB Replica', parent_zabbix_serviceid: '3', algorithm: '1', sortorder: 1, status: 0, tags: [{ tag: 'service', value: 'CORE_BANKING' }], synced_at: '2024-03-01T10:00:00Z' },
  { id: 5, zabbix_serviceid: '5', name: 'Payment API', algorithm: '0', sortorder: 0, status: 0, tags: [{ tag: 'service', value: 'PAYMENT_GW' }], synced_at: '2024-03-01T10:00:00Z' },
  { id: 6, zabbix_serviceid: '6', name: 'CRM Frontend', algorithm: '0', sortorder: 0, status: 0, tags: [{ tag: 'service', value: 'CRM' }], synced_at: '2024-03-01T10:00:00Z' },
  { id: 7, zabbix_serviceid: '7', name: 'CRM Backend', parent_zabbix_serviceid: '6', algorithm: '0', sortorder: 1, status: 0, tags: [{ tag: 'service', value: 'CRM' }], synced_at: '2024-03-01T10:00:00Z' },
];

export const mockPlannedWorks: PlannedWork[] = [
  {
    id: 1, title: 'Обновление сертификатов ABH HANA', description: 'Плановая замена SSL-сертификатов',
    service_id: 1, sla_id: 1, started_at: '2024-03-15T22:00:00Z', ended_at: '2024-03-16T02:00:00Z',
    status: 'done', downtime_marker: 'SLA Planner #1', downtime_period_from: 1710540000, downtime_period_to: 1710554400,
    created_by: 2, updated_by: 2, created_at: '2024-03-10T08:00:00Z', updated_at: '2024-03-16T02:30:00Z',
    service_name: 'ABH HANA 1', sla_name: 'ABH HANA'
  },
  {
    id: 2, title: 'ТО Core DB Primary', description: 'Ежеквартальное техническое обслуживание',
    service_id: 3, sla_id: 2, started_at: '2024-04-01T23:00:00Z', ended_at: '2024-04-02T05:00:00Z',
    status: 'planned', downtime_marker: 'SLA Planner #2', downtime_period_from: 1712012400, downtime_period_to: 1712034000,
    created_by: 2, updated_by: 2, created_at: '2024-03-20T10:00:00Z', updated_at: '2024-03-20T10:00:00Z',
    service_name: 'Core DB Primary', sla_name: 'Core Banking'
  },
  {
    id: 3, title: 'Обновление Payment API v2.5', description: 'Мажорное обновление API шлюза',
    service_id: 5, sla_id: 3, started_at: '2024-04-10T22:00:00Z', ended_at: '2024-04-11T04:00:00Z',
    status: 'draft', downtime_marker: 'SLA Planner #3', downtime_period_from: 1712786400, downtime_period_to: 1712808000,
    created_by: 1, updated_by: 1, created_at: '2024-03-25T14:00:00Z', updated_at: '2024-03-25T14:00:00Z',
    service_name: 'Payment API', sla_name: 'Payment Gateway'
  },
];

export const mockAuditLogs: AuditLogEntry[] = [
  { id: 1, user_id: 2, username: 'planner1', action: 'create', entity_type: 'planned_work', entity_id: 1, payload: { title: 'Обновление сертификатов ABH HANA' }, result: 'ok', created_at: '2024-03-10T08:00:00Z' },
  { id: 2, user_id: 2, username: 'planner1', action: 'sync', entity_type: 'planned_work', entity_id: 1, payload: { zabbix_slaid: '1' }, result: 'ok', created_at: '2024-03-10T08:01:00Z' },
  { id: 3, user_id: 2, username: 'planner1', action: 'create', entity_type: 'planned_work', entity_id: 2, payload: { title: 'ТО Core DB Primary' }, result: 'ok', created_at: '2024-03-20T10:00:00Z' },
  { id: 4, user_id: 1, username: 'admin', action: 'sync', entity_type: 'sla', entity_id: 0, payload: { count: 4 }, result: 'ok', created_at: '2024-03-01T10:00:00Z' },
  { id: 5, user_id: 1, username: 'admin', action: 'create', entity_type: 'planned_work', entity_id: 3, payload: { title: 'Обновление Payment API v2.5' }, result: 'ok', created_at: '2024-03-25T14:00:00Z' },
];

// Связь SLA ↔ Service (через теги)
export const slaServiceLinks: { sla_id: number; service_id: number }[] = [
  { sla_id: 1, service_id: 1 },
  { sla_id: 1, service_id: 2 },
  { sla_id: 2, service_id: 3 },
  { sla_id: 2, service_id: 4 },
  { sla_id: 3, service_id: 5 },
  { sla_id: 4, service_id: 6 },
  { sla_id: 4, service_id: 7 },
];
