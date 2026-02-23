import { api } from "./client";
import type {
  Event,
  CreateEventRequest,
  UpdateEventRequest,
  EventTeam,
  EventAdmin,
  HiddenRange,
} from "./types";

export const eventsApi = {
  list: () => api.get<Event[]>("/events"),
  getBySlug: (slug: string) => api.get<Event>(`/events/${slug}`),
  create: (data: CreateEventRequest) => api.post<Event>("/events", data),
  update: (slug: string, data: UpdateEventRequest) =>
    api.put<Event>(`/events/${slug}`, data),
  delete: (slug: string) =>
    api.delete<{ message: string }>(`/events/${slug}`),

  // Lock / Public
  setLocked: (slug: string, is_locked: boolean) =>
    api.put<{ is_locked: boolean }>(`/events/${slug}/lock`, { is_locked }),
  setPublic: (slug: string, is_public: boolean) =>
    api.put<{ is_public: boolean }>(`/events/${slug}/public`, { is_public }),

  // Team visibility
  listTeams: (slug: string) => api.get<EventTeam[]>(`/events/${slug}/teams`),
  setTeam: (slug: string, team_id: string, is_visible: boolean) =>
    api.post<{ message: string }>(`/events/${slug}/teams`, {
      team_id,
      is_visible,
    }),
  removeTeam: (slug: string, teamId: string) =>
    api.delete<{ message: string }>(`/events/${slug}/teams/${teamId}`),

  // Admin management
  listAdmins: (slug: string) =>
    api.get<EventAdmin[]>(`/events/${slug}/admins`),
  addAdmin: (slug: string, user_id: string) =>
    api.post<{ message: string }>(`/events/${slug}/admins`, { user_id }),
  removeAdmin: (slug: string, userId: string) =>
    api.delete<{ message: string }>(`/events/${slug}/admins/${userId}`),

  // Hidden ranges
  listHiddenRanges: (slug: string) =>
    api.get<HiddenRange[]>(`/events/${slug}/hidden-ranges`),
  setHiddenRanges: (
    slug: string,
    ranges: { hide_start_hour: number; hide_end_hour: number }[]
  ) =>
    api.put<HiddenRange[]>(`/events/${slug}/hidden-ranges`, { ranges }),
};
