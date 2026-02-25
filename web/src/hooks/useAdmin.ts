import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";

export function useAppSettings() {
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const res = await adminApi.listSettings();
      return res.data!;
    },
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      adminApi.setSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const res = await adminApi.getStats();
      return res.data!;
    },
  });
}

export function useRunCleanup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminApi.runCleanup(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}
