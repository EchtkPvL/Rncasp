import { api } from "./client";
import type { Webhook, CreateWebhookRequest, UpdateWebhookRequest } from "./types";

export const webhooksApi = {
  list: (slug: string) =>
    api.get<Webhook[]>(`/events/${slug}/webhooks`),

  create: (slug: string, data: CreateWebhookRequest) =>
    api.post<Webhook>(`/events/${slug}/webhooks`, data),

  update: (slug: string, webhookId: string, data: UpdateWebhookRequest) =>
    api.put<Webhook>(`/events/${slug}/webhooks/${webhookId}`, data),

  delete: (slug: string, webhookId: string) =>
    api.delete<{ message: string }>(`/events/${slug}/webhooks/${webhookId}`),

  test: (slug: string, webhookId: string) =>
    api.post<{ message: string }>(`/events/${slug}/webhooks/${webhookId}/test`),
};

export const adminWebhooksApi = {
  list: () =>
    api.get<Webhook[]>("/admin/webhooks"),

  create: (data: CreateWebhookRequest) =>
    api.post<Webhook>("/admin/webhooks", data),

  update: (webhookId: string, data: UpdateWebhookRequest) =>
    api.put<Webhook>(`/admin/webhooks/${webhookId}`, data),

  delete: (webhookId: string) =>
    api.delete<{ message: string }>(`/admin/webhooks/${webhookId}`),

  test: (webhookId: string) =>
    api.post<{ message: string }>(`/admin/webhooks/${webhookId}/test`),
};
