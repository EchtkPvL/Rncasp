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
  total_sessions: number;
  expired_sessions: number;
  total_audit_entries: number;
  total_notifications: number;
  read_notifications: number;
}

export interface CleanupResult {
  expired_sessions: number;
  old_audit_entries: number;
  old_notifications: number;
  used_recovery_codes: number;
}

export const adminApi = {
  listSettings: () => api.get<AppSetting[]>("/admin/settings"),
  getSetting: (key: string) => api.get<AppSetting>(`/admin/settings/${key}`),
  setSetting: (key: string, value: unknown) =>
    api.put<AppSetting>(`/admin/settings/${key}`, { value }),
  deleteSetting: (key: string) => api.delete(`/admin/settings/${key}`),
  getStats: () => api.get<DashboardStats>("/admin/stats"),
  runCleanup: () => api.post<CleanupResult>("/admin/cleanup"),
  getPublicSettings: () => api.get<AppSetting[]>("/settings/public"),
};
