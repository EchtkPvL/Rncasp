import { api } from "./client";
import type { SMTPConfig, UpdateSMTPConfigRequest } from "./types";

export const smtpApi = {
  getConfig: () =>
    api.get<SMTPConfig | null>("/smtp"),

  updateConfig: (data: UpdateSMTPConfigRequest) =>
    api.put<SMTPConfig>("/smtp", data),

  testConnection: (to: string) =>
    api.post<{ message: string }>("/smtp/test", { to }),
};
