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
};
