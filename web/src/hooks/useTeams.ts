import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { teamsApi } from "@/api/teams";
import type { CreateTeamRequest, UpdateTeamRequest } from "@/api/types";

export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await teamsApi.list();
      return res.data!;
    },
  });
}

export function useTeam(id: string) {
  return useQuery({
    queryKey: ["teams", id],
    queryFn: async () => {
      const res = await teamsApi.getById(id);
      return res.data!;
    },
    enabled: !!id,
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTeamRequest) => teamsApi.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTeamRequest }) =>
      teamsApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teamsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}
