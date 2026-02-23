import { api } from "./client";

export interface AppSetting {
  key: string;
  value: unknown;
  updated_at: string;
}

export interface DashboardStats {
  total_users: number;
  total_events: number;
  active_events: number;
  total_shifts: number;
  total_teams: number;
}

export const adminApi = {
  listSettings: () => api.get<AppSetting[]>("/admin/settings"),
  getSetting: (key: string) => api.get<AppSetting>(`/admin/settings/${key}`),
  setSetting: (key: string, value: unknown) =>
    api.put<AppSetting>(`/admin/settings/${key}`, { value }),
  deleteSetting: (key: string) => api.delete(`/admin/settings/${key}`),
  getStats: () => api.get<DashboardStats>("/admin/stats"),
  getPublicSettings: () => api.get<AppSetting[]>("/settings/public"),
};
