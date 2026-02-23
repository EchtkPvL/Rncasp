import { api } from "./client";
import type { User, LoginRequest, RegisterRequest, LoginResult, TOTPSetupResult } from "./types";

export const authApi = {
  login: (data: LoginRequest) => api.post<LoginResult>("/auth/login", data),
  register: (data: RegisterRequest) => api.post<User>("/auth/register", data),
  logout: () => api.post<{ message: string }>("/auth/logout"),
  me: () => api.get<User>("/auth/me"),
  updateProfile: (data: { full_name?: string; display_name?: string; email?: string; password?: string }) =>
    api.put<User>("/auth/me", data),

  // TOTP
  totpSetup: () => api.post<TOTPSetupResult>("/auth/totp/setup"),
  totpEnable: (code: string) => api.post<{ message: string }>("/auth/totp/enable", { code }),
  totpDisable: (code: string) => api.post<{ message: string }>("/auth/totp/disable", { code }),
  totpVerify: (pending_token: string, code: string) =>
    api.post<User>("/auth/totp/verify", { pending_token, code }),
  recoveryCodeCount: () => api.get<{ remaining: number }>("/auth/totp/recovery-codes"),
  regenerateRecoveryCodes: (code: string) =>
    api.post<{ recovery_codes: string[] }>("/auth/totp/recovery-codes", { code }),
};
