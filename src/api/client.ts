import { SLA, Service, PlannedWork, AuditLogEntry, User } from '../types';
import { mockSLAs, mockServices, mockPlannedWorks, mockAuditLogs, mockUsers, slaServiceLinks } from './mockData';

// Mock API client — заменяется на реальный бэкенд
let plannedWorks = [...mockPlannedWorks];
let nextWorkId = 4;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export const api = {
  // Auth
  async login(username: string, _password: string): Promise<{ token: string; user: User }> {
    await delay(300);
    const user = mockUsers.find(u => u.username === username);
    if (!user) throw new Error('Invalid credentials');
    return { token: 'mock-jwt-token', user };
  },

  // SLAs
  async getSLAs(): Promise<SLA[]> {
    await delay(200);
    return [...mockSLAs];
  },

  async syncSLAsFromZabbix(): Promise<{ synced: number }> {
    await delay(1000);
    return { synced: mockSLAs.length };
  },

  // Services
  async getServices(): Promise<Service[]> {
    await delay(200);
    return [...mockServices];
  },

  async syncServicesFromZabbix(): Promise<{ synced: number }> {
    await delay(1000);
    return { synced: mockServices.length };
  },

  // SLA-Service Links
  async getSLAServiceLinks(): Promise<{ sla_id: number; service_id: number }[]> {
    await delay(100);
    return [...slaServiceLinks];
  },

  // Planned Works
  async getPlannedWorks(): Promise<PlannedWork[]> {
    await delay(200);
    return [...plannedWorks];
  },

  async createPlannedWork(data: Partial<PlannedWork>): Promise<PlannedWork> {
    await delay(500);
    const work: PlannedWork = {
      id: nextWorkId++,
      title: data.title || '',
      description: data.description || '',
      service_id: data.service_id || 0,
      sla_id: data.sla_id || 0,
      started_at: data.started_at || '',
      ended_at: data.ended_at || '',
      status: 'draft',
      downtime_marker: `SLA Planner #${nextWorkId - 1}`,
      downtime_period_from: data.downtime_period_from || 0,
      downtime_period_to: data.downtime_period_to || 0,
      created_by: 1,
      updated_by: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      service_name: data.service_name,
      sla_name: data.sla_name,
    };
    plannedWorks.push(work);
    return work;
  },

  async updatePlannedWork(id: number, data: Partial<PlannedWork>): Promise<PlannedWork> {
    await delay(500);
    const idx = plannedWorks.findIndex(w => w.id === id);
    if (idx === -1) throw new Error('Not found');
    plannedWorks[idx] = { ...plannedWorks[idx], ...data, updated_at: new Date().toISOString() };
    return plannedWorks[idx];
  },

  async pushToZabbix(id: number): Promise<{ success: boolean; error?: string }> {
    await delay(1500);
    // Mock: 90% success
    if (Math.random() > 0.1) {
      const idx = plannedWorks.findIndex(w => w.id === id);
      if (idx !== -1) {
        plannedWorks[idx].status = 'planned';
      }
      return { success: true };
    }
    return { success: false, error: 'Mock: Zabbix connection timeout' };
  },

  async deletePlannedWork(id: number): Promise<void> {
    await delay(300);
    plannedWorks = plannedWorks.filter(w => w.id !== id);
  },

  // Audit
  async getAuditLogs(): Promise<AuditLogEntry[]> {
    await delay(200);
    return [...mockAuditLogs];
  },

  // Users
  async getUsers(): Promise<User[]> {
    await delay(200);
    return [...mockUsers];
  },

  // Health
  async health(): Promise<{ status: string; version: string }> {
    await delay(100);
    return { status: 'ok', version: '0.1.0' };
  },
};
