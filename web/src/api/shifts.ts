import { api } from "./client";
import type {
  Shift,
  UserShift,
  ShiftWithWarnings,
  CreateShiftRequest,
  UpdateShiftRequest,
  CoverageRequirement,
  CreateCoverageRequest,
  UpdateCoverageRequest,
  GridData,
} from "./types";

export const shiftsApi = {
  // User shifts (all shifts for authenticated user)
  listMyShifts: () =>
    api.get<UserShift[]>("/users/me/shifts"),

  // Shifts
  listByEvent: (slug: string) =>
    api.get<Shift[]>(`/events/${slug}/shifts`),
  listByEventAndTeam: (slug: string, teamId: string) =>
    api.get<Shift[]>(`/events/${slug}/shifts?team_id=${teamId}`),
  getById: (slug: string, shiftId: string) =>
    api.get<Shift>(`/events/${slug}/shifts/${shiftId}`),
  create: (slug: string, data: CreateShiftRequest) =>
    api.post<ShiftWithWarnings>(`/events/${slug}/shifts`, data),
  update: (slug: string, shiftId: string, data: UpdateShiftRequest) =>
    api.put<Shift>(`/events/${slug}/shifts/${shiftId}`, data),
  delete: (slug: string, shiftId: string) =>
    api.delete<{ message: string }>(`/events/${slug}/shifts/${shiftId}`),

  // Grid data (combined endpoint)
  gridData: (slug: string) =>
    api.get<GridData>(`/events/${slug}/grid`),

  // Coverage
  listCoverage: (slug: string) =>
    api.get<CoverageRequirement[]>(`/events/${slug}/coverage`),
  createCoverage: (slug: string, data: CreateCoverageRequest) =>
    api.post<CoverageRequirement>(`/events/${slug}/coverage`, data),
  updateCoverage: (slug: string, coverageId: string, data: UpdateCoverageRequest) =>
    api.put<CoverageRequirement>(`/events/${slug}/coverage/${coverageId}`, data),
  deleteCoverage: (slug: string, coverageId: string) =>
    api.delete<{ message: string }>(`/events/${slug}/coverage/${coverageId}`),
  deleteCoverageByTeam: (slug: string, teamId: string) =>
    api.delete<{ message: string }>(`/events/${slug}/coverage/team/${teamId}`),
};
