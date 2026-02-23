import { api } from "./client";
import type { User, CreateDummyRequest, UpdateDummyRequest } from "./types";

export const usersApi = {
  list: (params?: { role?: string; account_type?: string; limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.role) search.set("role", params.role);
    if (params?.account_type) search.set("account_type", params.account_type);
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.offset) search.set("offset", String(params.offset));
    const qs = search.toString();
    return api.get<User[]>(`/users${qs ? `?${qs}` : ""}`);
  },

  search: (query: string, limit = 50) =>
    api.get<User[]>(`/users/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  getById: (userId: string) =>
    api.get<User>(`/users/${userId}`),

  updateUser: (userId: string, data: { role?: string; is_active?: boolean; full_name?: string; display_name?: string; email?: string; password?: string }) =>
    api.put<User>(`/users/${userId}`, data),

  createDummy: (data: CreateDummyRequest) =>
    api.post<User>("/users/dummy", data),

  updateDummy: (userId: string, data: UpdateDummyRequest) =>
    api.put<User>(`/users/dummy/${userId}`, data),

  deleteDummy: (userId: string) =>
    api.delete<void>(`/users/dummy/${userId}`),
};
