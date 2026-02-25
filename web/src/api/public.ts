import { api } from "./client";
import type { Event, GridData, PrintConfig } from "./types";

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

  downloadPDF: async (slug: string, config: PrintConfig): Promise<Blob> => {
    const params = new URLSearchParams();
    params.set("layout", config.layout);
    params.set("paper", config.paperSize);
    params.set("landscape", String(config.landscape));
    params.set("coverage", String(config.showCoverage));
    params.set("colors", String(config.showTeamColors));
    if (config.selectedDays.length > 0) {
      params.set("days", config.selectedDays.map((d) => d.toISOString().split("T")[0]).join(","));
    }
    if (config.selectedUserIds) {
      params.set("users", config.selectedUserIds.join(","));
    }
    const res = await fetch(`${API_BASE}/public/events/${slug}/export/pdf?${params}`);
    if (!res.ok) throw new Error("Failed to download PDF");
    return res.blob();
  },
};
