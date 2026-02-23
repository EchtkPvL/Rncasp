import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { eventsApi } from "@/api/events";
import type { CreateEventRequest, UpdateEventRequest } from "@/api/types";

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const res = await eventsApi.list();
      return res.data!;
    },
  });
}

export function useEvent(slug: string) {
  return useQuery({
    queryKey: ["events", slug],
    queryFn: async () => {
      const res = await eventsApi.getBySlug(slug);
      return res.data!;
    },
    enabled: !!slug,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEventRequest) => eventsApi.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: UpdateEventRequest }) =>
      eventsApi.update(slug, data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events", vars.slug] });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => eventsApi.delete(slug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useSetEventLocked() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, is_locked }: { slug: string; is_locked: boolean }) =>
      eventsApi.setLocked(slug, is_locked),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events", vars.slug] });
    },
  });
}

export function useSetEventPublic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, is_public }: { slug: string; is_public: boolean }) =>
      eventsApi.setPublic(slug, is_public),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events", vars.slug] });
    },
  });
}

export function useEventTeams(slug: string) {
  return useQuery({
    queryKey: ["events", slug, "teams"],
    queryFn: async () => {
      const res = await eventsApi.listTeams(slug);
      return res.data!;
    },
    enabled: !!slug,
  });
}

export function useEventAdmins(slug: string) {
  return useQuery({
    queryKey: ["events", slug, "admins"],
    queryFn: async () => {
      const res = await eventsApi.listAdmins(slug);
      return res.data!;
    },
    enabled: !!slug,
  });
}

export function useEventHiddenRanges(slug: string) {
  return useQuery({
    queryKey: ["events", slug, "hidden-ranges"],
    queryFn: async () => {
      const res = await eventsApi.listHiddenRanges(slug);
      return res.data!;
    },
    enabled: !!slug,
  });
}
