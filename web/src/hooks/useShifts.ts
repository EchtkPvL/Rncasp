import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shiftsApi } from "@/api/shifts";
import type { CreateShiftRequest, UpdateShiftRequest, CreateCoverageRequest, GridData } from "@/api/types";

export function useMyShifts() {
  return useQuery({
    queryKey: ["my-shifts"],
    queryFn: async () => {
      const res = await shiftsApi.listMyShifts();
      return res.data!;
    },
  });
}

export function useGridData(slug: string) {
  return useQuery({
    queryKey: ["events", slug, "grid"],
    queryFn: async () => {
      const res = await shiftsApi.gridData(slug);
      return res.data!;
    },
    enabled: !!slug,
  });
}

export function useShifts(slug: string) {
  return useQuery({
    queryKey: ["events", slug, "shifts"],
    queryFn: async () => {
      const res = await shiftsApi.listByEvent(slug);
      return res.data!;
    },
    enabled: !!slug,
  });
}

export function useCoverage(slug: string) {
  return useQuery({
    queryKey: ["events", slug, "coverage"],
    queryFn: async () => {
      const res = await shiftsApi.listCoverage(slug);
      return res.data!;
    },
    enabled: !!slug,
  });
}

export function useCreateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: CreateShiftRequest }) =>
      shiftsApi.create(slug, data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["events", vars.slug, "grid"] });
      queryClient.invalidateQueries({ queryKey: ["my-shifts"] });
    },
  });
}

export function useUpdateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, shiftId, data }: { slug: string; shiftId: string; data: UpdateShiftRequest }) =>
      shiftsApi.update(slug, shiftId, data),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["events", vars.slug, "grid"] });
      const previousGrid = queryClient.getQueryData<GridData>(["events", vars.slug, "grid"]);
      queryClient.setQueryData<GridData>(["events", vars.slug, "grid"], (old) => {
        if (!old) return old;
        return {
          ...old,
          shifts: old.shifts.map((s) =>
            s.id === vars.shiftId
              ? { ...s, ...vars.data }
              : s,
          ),
        };
      });
      return { previousGrid };
    },
    onError: (_err, vars, context) => {
      if (context?.previousGrid) {
        queryClient.setQueryData(["events", vars.slug, "grid"], context.previousGrid);
      }
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: ["events", vars.slug, "grid"] });
      queryClient.invalidateQueries({ queryKey: ["my-shifts"] });
    },
  });
}

export function useDeleteShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, shiftId }: { slug: string; shiftId: string }) =>
      shiftsApi.delete(slug, shiftId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["events", vars.slug, "grid"] });
      queryClient.invalidateQueries({ queryKey: ["my-shifts"] });
    },
  });
}

export function useCreateCoverage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: CreateCoverageRequest }) =>
      shiftsApi.createCoverage(slug, data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["events", vars.slug] });
    },
  });
}

export function useDeleteCoverageByTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, teamId }: { slug: string; teamId: string }) =>
      shiftsApi.deleteCoverageByTeam(slug, teamId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["events", vars.slug] });
    },
  });
}
