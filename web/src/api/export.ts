import { api } from "./client";
import type { ICalToken, CreateICalTokenRequest, PrintConfig } from "./types";

const API_BASE = "/api";

export const exportApi = {
  downloadPDF: async (slug: string, config: PrintConfig): Promise<Blob> => {
    const params = new URLSearchParams();
    params.set("layout", config.layout);
    params.set("paper", config.paperSize);
    params.set("landscape", String(config.landscape));
    params.set("coverage", String(config.showCoverage));
    params.set("start", new Date(config.timeRange.start).toISOString());
    params.set("end", new Date(config.timeRange.end).toISOString());
    if (config.selectedUserIds) {
      params.set("users", config.selectedUserIds.join(","));
    }
    if (config.selectedTeamIds) {
      params.set("teams", config.selectedTeamIds.join(","));
    }
    if (config.onePerPage) {
      params.set("onePerPage", "true");
    }
    const res = await fetch(`${API_BASE}/events/${slug}/export/pdf?${params}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to download PDF");
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
