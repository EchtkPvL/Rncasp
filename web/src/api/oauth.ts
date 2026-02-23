import { api } from "./client";
import type {
  OAuthProvider,
  PublicOAuthProvider,
  OAuthConnection,
  CreateOAuthProviderRequest,
  UpdateOAuthProviderRequest,
} from "./types";

export const oauthApi = {
  // Public - list enabled providers for login page
  listEnabled: () =>
    api.get<PublicOAuthProvider[]>("/auth/oauth/providers"),

  // Authenticated user - manage own connections
  listConnections: () =>
    api.get<OAuthConnection[]>("/auth/oauth/connections"),
  unlinkConnection: (id: string) =>
    api.delete<void>(`/auth/oauth/connections/${id}`),

  // Super-admin - provider CRUD
  listProviders: () => api.get<OAuthProvider[]>("/oauth/providers"),
  createProvider: (data: CreateOAuthProviderRequest) =>
    api.post<OAuthProvider>("/oauth/providers", data),
  getProvider: (id: string) =>
    api.get<OAuthProvider>(`/oauth/providers/${id}`),
  updateProvider: (id: string, data: UpdateOAuthProviderRequest) =>
    api.put<OAuthProvider>(`/oauth/providers/${id}`, data),
  deleteProvider: (id: string) =>
    api.delete<void>(`/oauth/providers/${id}`),
};
