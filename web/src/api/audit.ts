import { api } from "./client";
import type { AuditLogEntry } from "./types";

export interface AuditLogParams {
  event_id?: string;
  user_id?: string;
  action?: string;
  entity_type?: string;
  limit?: number;
  offset?: number;
}

export const auditApi = {
  list: async (params: AuditLogParams = {}) => {
    const searchParams = new URLSearchParams();
    if (params.event_id) searchParams.set("event_id", params.event_id);
    if (params.user_id) searchParams.set("user_id", params.user_id);
    if (params.action) searchParams.set("action", params.action);
    if (params.entity_type) searchParams.set("entity_type", params.entity_type);
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.offset) searchParams.set("offset", String(params.offset));

    const query = searchParams.toString();
    const res = await api.get<AuditLogEntry[]>(`/audit-log${query ? `?${query}` : ""}`);
    return res.data!;
  },
};
