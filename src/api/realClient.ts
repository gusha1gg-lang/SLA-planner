/**
 * Real API client — connects to FastAPI backend via Vite proxy.
 * Falls back to mock data if backend is unavailable.
 */

import { SLA, Service, PlannedWork, AuditLogEntry, User } from '../types';
import { mockSLAs, mockServices, mockPlannedWorks, mockAuditLogs, mockUsers, slaServiceLinks } from './mockData';

const API_BASE = '/api';

class RealApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const params = new URLSearchParams({ username, password });
    const data = await this.request<{ access_token: string; user: User }>(
      `/auth/login?${params}`,
      { method: 'POST' }
    );
    this.token = data.access_token;
    return { token: data.access_token, user: data.user };
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  // SLAs
  async getSLAs(): Promise<SLA[]> {
    return this.request<SLA[]>('/sla/');
  }

  async syncSLAsFromZabbix(): Promise<{ synced: number }> {
    return this.request<{ synced: number }>('/sla/sync', { method: 'POST' });
  }

  // Services
  async getServices(): Promise<Service[]> {
    return this.request<Service[]>('/services/');
  }

  async syncServicesFromZabbix(): Promise<{ synced: number }> {
    return this.request<{ synced: number }>('/services/sync', { method: 'POST' });
  }

  // Planned Works
  async getPlannedWorks(): Promise<PlannedWork[]> {
    return this.request<PlannedWork[]>('/works/');
  }

  async createPlannedWork(data: Partial<PlannedWork>): Promise<PlannedWork> {
    return this.request<PlannedWork>('/works/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePlannedWork(id: number, data: Partial<PlannedWork>): Promise<PlannedWork> {
    return this.request<PlannedWork>(`/works/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async pushToZabbix(id: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request<{ success: boolean; message: string }>(`/works/${id}/push`, {
        method: 'POST',
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async deletePlannedWork(id: number): Promise<void> {
    await this.request<void>(`/works/${id}`, { method: 'DELETE' });
  }

  // Audit
  async getAuditLogs(): Promise<AuditLogEntry[]> {
    return this.request<AuditLogEntry[]>('/audit/');
  }

  // Users
  async getUsers(): Promise<User[]> {
    return this.request<User[]>('/users/');
  }

  // Health
  async health(): Promise<{ status: string; version: string }> {
    return this.request<{ status: string; version: string }>('/version');
  }
}

// Export singleton
export const realApi = new RealApiClient();

/**
 * Smart API client — tries real backend first, falls back to mock.
 */
let mockWorks = [...mockPlannedWorks];
let nextMockId = mockWorks.length + 1;

export const api = {
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    try {
      const result = await realApi.login(username, password);
      return result;
    } catch {
      // Fallback to mock
      const user = mockUsers.find(u => u.username === username);
      if (!user) throw new Error('Неверный логин или пароль');
      if (password.length < 3) throw new Error('Неверный логин или пароль');
      return { token: 'mock-jwt-token', user };
    }
  },

  async getSLAs(): Promise<SLA[]> {
    try {
      return await realApi.getSLAs();
    } catch {
      return [...mockSLAs];
    }
  },

  async syncSLAsFromZabbix(): Promise<{ synced: number }> {
    try {
      return await realApi.syncSLAsFromZabbix();
    } catch {
      await new Promise(r => setTimeout(r, 1000));
      return { synced: mockSLAs.length };
    }
  },

  async getServices(): Promise<Service[]> {
    try {
      return await realApi.getServices();
    } catch {
      return [...mockServices];
    }
  },

  async syncServicesFromZabbix(): Promise<{ synced: number }> {
    try {
      return await realApi.syncServicesFromZabbix();
    } catch {
      await new Promise(r => setTimeout(r, 1000));
      return { synced: mockServices.length };
    }
  },

  async getSLAServiceLinks(): Promise<{ sla_id: number; service_id: number }[]> {
    return slaServiceLinks;
  },

  async getPlannedWorks(): Promise<PlannedWork[]> {
    try {
      return await realApi.getPlannedWorks();
    } catch {
      return [...mockWorks];
    }
  },

  async createPlannedWork(data: Partial<PlannedWork>): Promise<PlannedWork> {
    try {
      return await realApi.createPlannedWork(data);
    } catch {
      // Mock fallback
      await new Promise(r => setTimeout(r, 500));
      const work: PlannedWork = {
        id: nextMockId++,
        title: data.title || '',
        description: data.description || '',
        service_id: data.service_id || 0,
        sla_id: data.sla_id || 0,
        started_at: data.started_at || '',
        ended_at: data.ended_at || '',
        status: 'draft',
        downtime_marker: `SLA Planner #${nextMockId - 1}`,
        downtime_period_from: data.downtime_period_from || 0,
        downtime_period_to: data.downtime_period_to || 0,
        created_by: 1,
        updated_by: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        service_name: data.service_name,
        sla_name: data.sla_name,
      };
      mockWorks.push(work);
      return work;
    }
  },

  async updatePlannedWork(id: number, data: Partial<PlannedWork>): Promise<PlannedWork> {
    try {
      return await realApi.updatePlannedWork(id, data);
    } catch {
      await new Promise(r => setTimeout(r, 500));
      const idx = mockWorks.findIndex(w => w.id === id);
      if (idx === -1) throw new Error('Not found');
      mockWorks[idx] = { ...mockWorks[idx], ...data, updated_at: new Date().toISOString() };
      return mockWorks[idx];
    }
  },

  async pushToZabbix(id: number): Promise<{ success: boolean; error?: string }> {
    try {
      return await realApi.pushToZabbix(id);
    } catch {
      await new Promise(r => setTimeout(r, 1500));
      if (Math.random() > 0.1) {
        const idx = mockWorks.findIndex(w => w.id === id);
        if (idx !== -1) mockWorks[idx].status = 'planned';
        return { success: true };
      }
      return { success: false, error: 'Mock: Zabbix connection timeout' };
    }
  },

  async deletePlannedWork(id: number): Promise<void> {
    try {
      await realApi.deletePlannedWork(id);
    } catch {
      await new Promise(r => setTimeout(r, 300));
      mockWorks = mockWorks.filter(w => w.id !== id);
    }
  },

  async getAuditLogs(): Promise<AuditLogEntry[]> {
    try {
      return await realApi.getAuditLogs();
    } catch {
      return [...mockAuditLogs];
    }
  },

  async getUsers(): Promise<User[]> {
    try {
      return await realApi.getUsers();
    } catch {
      return [...mockUsers];
    }
  },

  async health(): Promise<{ status: string; version: string }> {
    try {
      return await realApi.health();
    } catch {
      return { status: 'ok', version: '0.1.0' };
    }
  },
};
