/**
 * Real API client — connects to FastAPI backend via Vite proxy.
 * Работает ТОЛЬКО с живыми данными: мок/seed-данные запрещены.
 */

import { SLA, Service, PlannedWork, AuditLogEntry, User, ExcludedDowntime } from '../types';

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

  async getSLAServiceLinks(): Promise<{ sla_id: number; service_id: number }[]> {
    return this.request<{ sla_id: number; service_id: number }[]>('/sla/service-links');
  }

  async syncFull(): Promise<{ slas: number; services: number; links: number }> {
    return this.request<{ slas: number; services: number; links: number }>('/sync/full', {
      method: 'POST',
    });
  }

  // Excluded downtimes (живые данные из Zabbix)
  async getSLAExcludedDowntimes(zabbixSlaid: string): Promise<ExcludedDowntime[]> {
    return this.request<ExcludedDowntime[]>(`/sla/${zabbixSlaid}/excluded-downtimes`);
  }

  async addSLAExcludedDowntime(
    zabbixSlaid: string,
    data: { name: string; period_from: string; period_to: string }
  ): Promise<ExcludedDowntime[]> {
    return this.request<ExcludedDowntime[]>(`/sla/${zabbixSlaid}/excluded-downtimes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeSLADowntime(zabbixSlaid: string, name: string): Promise<ExcludedDowntime[]> {
    return this.request<ExcludedDowntime[]>(
      `/sla/${zabbixSlaid}/excluded-downtimes/${encodeURIComponent(name)}`,
      { method: 'DELETE' }
    );
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

  // Graph layout (позиции узлов по моделям здоровья)
  async getGraphPositions(model: string): Promise<{ node_key: string; x: number; y: number }[]> {
    return this.request<{ node_key: string; x: number; y: number }[]>(
      `/graph/positions?model=${encodeURIComponent(model)}`
    );
  }

  async saveGraphPositions(
    model: string,
    positions: { node_key: string; x: number; y: number }[]
  ): Promise<{ saved: number }> {
    return this.request<{ saved: number }>('/graph/positions', {
      method: 'PUT',
      body: JSON.stringify({ model, positions }),
    });
  }

  async clearGraphPositions(model: string): Promise<{ cleared: boolean }> {
    return this.request<{ cleared: boolean }>(
      `/graph/positions?model=${encodeURIComponent(model)}`,
      { method: 'DELETE' }
    );
  }

  // Graph node colors (цвета узлов SLA и услуг, общие для всех)
  async getGraphColors(): Promise<{ sla: string; service: string }> {
    return this.request<{ sla: string; service: string }>('/graph/colors');
  }

  async saveGraphColors(colors: { sla: string; service: string }): Promise<{ saved: boolean }> {
    return this.request<{ saved: boolean }>('/graph/colors', {
      method: 'PUT',
      body: JSON.stringify(colors),
    });
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
 * API client — всегда ходит в реальный бэкенд (живые данные).
 * Мок-фолбэки удалены по требованию проекта.
 */
export const api = {
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    return await realApi.login(username, password);
  },

  async getSLAs(): Promise<SLA[]> {
    return await realApi.getSLAs();
  },

  async syncSLAsFromZabbix(): Promise<{ synced: number }> {
    return await realApi.syncSLAsFromZabbix();
  },

  async getServices(): Promise<Service[]> {
    return await realApi.getServices();
  },

  async syncServicesFromZabbix(): Promise<{ synced: number }> {
    return await realApi.syncServicesFromZabbix();
  },

  async getSLAServiceLinks(): Promise<{ sla_id: number; service_id: number }[]> {
    return await realApi.getSLAServiceLinks();
  },

  async syncFull(): Promise<{ slas: number; services: number; links: number }> {
    return await realApi.syncFull();
  },

  async getSLAExcludedDowntimes(zabbixSlaid: string): Promise<ExcludedDowntime[]> {
    return await realApi.getSLAExcludedDowntimes(zabbixSlaid);
  },

  async addSLAExcludedDowntime(
    zabbixSlaid: string,
    data: { name: string; period_from: string; period_to: string }
  ): Promise<ExcludedDowntime[]> {
    return await realApi.addSLAExcludedDowntime(zabbixSlaid, data);
  },

  async removeSLADowntime(zabbixSlaid: string, name: string): Promise<ExcludedDowntime[]> {
    return await realApi.removeSLADowntime(zabbixSlaid, name);
  },

  async getPlannedWorks(): Promise<PlannedWork[]> {
    return await realApi.getPlannedWorks();
  },

  async createPlannedWork(data: Partial<PlannedWork>): Promise<PlannedWork> {
    return await realApi.createPlannedWork(data);
  },

  async updatePlannedWork(id: number, data: Partial<PlannedWork>): Promise<PlannedWork> {
    return await realApi.updatePlannedWork(id, data);
  },

  async pushToZabbix(id: number): Promise<{ success: boolean; error?: string }> {
    return await realApi.pushToZabbix(id);
  },

  async deletePlannedWork(id: number): Promise<void> {
    return await realApi.deletePlannedWork(id);
  },

  async getAuditLogs(): Promise<AuditLogEntry[]> {
    return await realApi.getAuditLogs();
  },

  async getGraphPositions(model: string): Promise<{ node_key: string; x: number; y: number }[]> {
    return await realApi.getGraphPositions(model);
  },

  async saveGraphPositions(
    model: string,
    positions: { node_key: string; x: number; y: number }[]
  ): Promise<{ saved: number }> {
    return await realApi.saveGraphPositions(model, positions);
  },

  async clearGraphPositions(model: string): Promise<{ cleared: boolean }> {
    return await realApi.clearGraphPositions(model);
  },

  async getGraphColors(): Promise<{ sla: string; service: string }> {
    return await realApi.getGraphColors();
  },

  async saveGraphColors(colors: { sla: string; service: string }): Promise<{ saved: boolean }> {
    return await realApi.saveGraphColors(colors);
  },

  async getUsers(): Promise<User[]> {
    return await realApi.getUsers();
  },

  async health(): Promise<{ status: string; version: string; zabbix_connected?: boolean }> {
    try {
      const result = await realApi.health();
      return { ...result, zabbix_connected: true };
    } catch {
      return { status: 'offline', version: '0.1.0', zabbix_connected: false };
    }
  },
};