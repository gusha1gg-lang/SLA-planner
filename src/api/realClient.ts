/**
 * Real API client — connects to FastAPI backend via Vite proxy.
 * Работает ТОЛЬКО с живыми данными: мок/seed-данные запрещены.
 */

import {
  SLA, Service, PlannedWork, AuditLogEntry, User, Group, ExcludedDowntime,
  ServiceConfig, SyncResult, SyncStatus, GraphColors,
} from '../types';

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

  /** Статус фонового синка и планировщика автосинхронизации. */
  async getSyncStatus(): Promise<SyncStatus> {
    return this.request<SyncStatus>('/sync/status');
  }

  /** Полный синк с Zabbix: запуск фоновый (202), результат ждём через /sync/status.
   *  При уже идущем синке бэкенд отвечает 409 — ошибка с понятным текстом. */
  async syncFull(): Promise<SyncResult> {
    await this.request<{ status: 'started' }>('/sync/full', { method: 'POST' });
    // Поллинг статуса фонового синка: до 5 минут по 1 с, дальше — таймаут.
    for (let attempt = 0; attempt < 300; attempt++) {
      const st = await this.getSyncStatus();
      if (st.status === 'ok') {
        return st.result ?? { slas: 0, services: 0, links: 0 };
      }
      if (st.status === 'error' || st.status === 'skipped') {
        throw new Error(st.error || `Синхронизация завершилась: ${st.status}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Таймаут ожидания синхронизации');
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

  // Живая конфигурация услуги из Zabbix (для страницы «Услуги»)
  async getServiceConfig(zabbixServiceId: string): Promise<ServiceConfig> {
    return this.request<ServiceConfig>(
      `/services/${encodeURIComponent(zabbixServiceId)}/config`
    );
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

  // Graph node colors (базовые цвета типов + индивидуальные цвета узлов модели)
  async getGraphColors(model?: string): Promise<GraphColors> {
    const qs = model ? `?model=${encodeURIComponent(model)}` : '';
    return this.request<GraphColors>(`/graph/colors${qs}`);
  }

  async saveGraphColors(colors: { sla: string; service: string }): Promise<{ saved: boolean }> {
    return this.request<{ saved: boolean }>('/graph/colors', {
      method: 'PUT',
      body: JSON.stringify(colors),
    });
  }

  /** Задать цвет конкретного узла модели (node_key = "svc:..." | "sla:..."). */
  async saveGraphNodeColor(
    model: string,
    nodeKey: string,
    color: string
  ): Promise<{ saved: boolean }> {
    return this.request<{ saved: boolean }>('/graph/colors/node', {
      method: 'PUT',
      body: JSON.stringify({ model, node_key: nodeKey, color }),
    });
  }

  /** Сбросить цвет узла к базовому. */
  async clearGraphNodeColor(model: string, nodeKey: string): Promise<{ cleared: boolean }> {
    return this.request<{ cleared: boolean }>(
      `/graph/colors/node?model=${encodeURIComponent(model)}&node_key=${encodeURIComponent(nodeKey)}`,
      { method: 'DELETE' }
    );
  }

  // Users (admin)
  async getUsers(): Promise<User[]> {
    return this.request<User[]>('/users/');
  }

  async createUser(data: {
    username: string;
    password: string;
    role: string;
  }): Promise<User> {
    return this.request<User>('/users/', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateUser(
    id: number,
    data: { role?: string; is_active?: boolean; password?: string }
  ): Promise<User> {
    return this.request<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  // Groups (admin) — группы/команды с правами
  async getGroups(): Promise<Group[]> {
    return this.request<Group[]>('/groups/');
  }

  async createGroup(data: {
    name: string;
    description: string;
    permissions: string[];
    all_models: boolean;
    model_ids: string[];
    member_ids: number[];
  }): Promise<Group> {
    return this.request<Group>('/groups/', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateGroup(
    id: number,
    data: { name: string; description: string; permissions: string[]; all_models: boolean; model_ids: string[]; member_ids: number[] }
  ): Promise<Group> {
    return this.request<Group>(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteGroup(id: number): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/groups/${id}`, { method: 'DELETE' });
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

  async getServiceConfig(zabbixServiceId: string): Promise<ServiceConfig> {
    return await realApi.getServiceConfig(zabbixServiceId);
  },

  async getSLAServiceLinks(): Promise<{ sla_id: number; service_id: number }[]> {
    return await realApi.getSLAServiceLinks();
  },

  async getSyncStatus(): Promise<SyncStatus> {
    return await realApi.getSyncStatus();
  },

  async syncFull(): Promise<SyncResult> {
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

  async getGraphColors(model?: string): Promise<GraphColors> {
    return await realApi.getGraphColors(model);
  },

  async saveGraphColors(colors: { sla: string; service: string }): Promise<{ saved: boolean }> {
    return await realApi.saveGraphColors(colors);
  },

  async saveGraphNodeColor(
    model: string,
    nodeKey: string,
    color: string
  ): Promise<{ saved: boolean }> {
    return await realApi.saveGraphNodeColor(model, nodeKey, color);
  },

  async clearGraphNodeColor(model: string, nodeKey: string): Promise<{ cleared: boolean }> {
    return await realApi.clearGraphNodeColor(model, nodeKey);
  },

  async getUsers(): Promise<User[]> {
    return await realApi.getUsers();
  },

  async createUser(data: {
    username: string;
    password: string;
    role: string;
  }): Promise<User> {
    return await realApi.createUser(data);
  },

  async updateUser(
    id: number,
    data: { role?: string; is_active?: boolean; password?: string }
  ): Promise<User> {
    return await realApi.updateUser(id, data);
  },

  async getGroups(): Promise<Group[]> {
    return await realApi.getGroups();
  },

  async createGroup(data: {
    name: string;
    description: string;
    permissions: string[];
    all_models: boolean;
    model_ids: string[];
    member_ids: number[];
  }): Promise<Group> {
    return await realApi.createGroup(data);
  },

  async updateGroup(
    id: number,
    data: { name: string; description: string; permissions: string[]; all_models: boolean; model_ids: string[]; member_ids: number[] }
  ): Promise<Group> {
    return await realApi.updateGroup(id, data);
  },

  async deleteGroup(id: number): Promise<{ deleted: boolean }> {
    return await realApi.deleteGroup(id);
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