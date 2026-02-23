import { api } from "./client";
import type { Event, GridData } from "./types";

const API_BASE = "/api";

export const publicApi = {
  getEvent: async (slug: string) => {
    const res = await api.get<Event>(`/public/events/${slug}`);
    return res.data!;
  },

  getGrid: async (slug: string) => {
    const res = await api.get<GridData>(`/public/events/${slug}/grid`);
    return res.data!;
  },

  downloadCSV: async (slug: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/public/events/${slug}/export/csv`);
    if (!res.ok) throw new Error("Failed to download CSV");
    return res.blob();
  },

  downloadICal: async (slug: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/public/events/${slug}/export/ical`);
    if (!res.ok) throw new Error("Failed to download iCal");
    return res.blob();
  },
};
