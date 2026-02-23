import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { availabilityApi } from "@/api/availability";
import type { SetAvailabilityRequest } from "@/api/types";

export function useEventAvailability(slug: string) {
  return useQuery({
    queryKey: ["events", slug, "availability"],
    queryFn: async () => {
      const res = await availabilityApi.listByEvent(slug);
      return res.data!;
    },
    enabled: !!slug,
  });
}

export function useMyAvailability(slug: string) {
  return useQuery({
    queryKey: ["events", slug, "availability", "mine"],
    queryFn: async () => {
      const res = await availabilityApi.listMine(slug);
      return res.data!;
    },
    enabled: !!slug,
  });
}

export function useSetMyAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: SetAvailabilityRequest }) =>
      availabilityApi.setMine(slug, data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["events", vars.slug, "availability"] });
      queryClient.invalidateQueries({ queryKey: ["events", vars.slug, "grid"] });
    },
  });
}
