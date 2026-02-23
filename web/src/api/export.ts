import { api } from "./client";
import type { ICalToken, CreateICalTokenRequest } from "./types";

const API_BASE = "/api";

export const exportApi = {
  downloadCSV: async (slug: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/events/${slug}/export/csv`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to download CSV");
    return res.blob();
  },

  downloadICal: async (slug: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/events/${slug}/export/ical`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to download iCal");
    return res.blob();
  },

  listTokens: async () => {
    const res = await api.get<ICalToken[]>("/ical-tokens");
    return res.data!;
  },

  createToken: async (data: CreateICalTokenRequest) => {
    const res = await api.post<ICalToken>("/ical-tokens", data);
    return res.data!;
  },

  revokeToken: async (tokenId: string) => {
    await api.delete(`/ical-tokens/${tokenId}`);
  },
};
