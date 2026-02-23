import { api } from "./client";
import type { Team, CreateTeamRequest, UpdateTeamRequest } from "./types";

export const teamsApi = {
  list: () => api.get<Team[]>("/teams"),
  getById: (id: string) => api.get<Team>(`/teams/${id}`),
  create: (data: CreateTeamRequest) => api.post<Team>("/teams", data),
  update: (id: string, data: UpdateTeamRequest) =>
    api.put<Team>(`/teams/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/teams/${id}`),
};
