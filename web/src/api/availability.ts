import { api } from "./client";
import type { Availability, SetAvailabilityRequest, AvailabilityGridEntry } from "./types";

export const availabilityApi = {
  listByEvent: (slug: string) =>
    api.get<AvailabilityGridEntry[]>(`/events/${slug}/availability`),

  listMine: (slug: string) =>
    api.get<Availability[]>(`/events/${slug}/availability/mine`),

  setMine: (slug: string, data: SetAvailabilityRequest) =>
    api.put<Availability[]>(`/events/${slug}/availability/mine`, data),

  setForUser: (slug: string, userId: string, data: SetAvailabilityRequest) =>
    api.put<Availability[]>(`/events/${slug}/availability/${userId}`, data),
};
