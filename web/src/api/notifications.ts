import { api } from "./client";
import type { Notification, NotificationPreference, UpdatePreferenceRequest } from "./types";

export const notificationsApi = {
  list: (limit = 50, offset = 0) =>
    api.get<Notification[]>(`/notifications?limit=${limit}&offset=${offset}`),

  unreadCount: () =>
    api.get<{ unread_count: number }>("/notifications/unread-count"),

  markRead: (notificationId: string) =>
    api.post<{ message: string }>(`/notifications/${notificationId}/read`),

  markAllRead: () =>
    api.post<{ message: string }>("/notifications/read-all"),

  getPreferences: () =>
    api.get<NotificationPreference[]>("/notifications/preferences"),

  updatePreference: (data: UpdatePreferenceRequest) =>
    api.put<{ message: string }>("/notifications/preferences", data),
};
