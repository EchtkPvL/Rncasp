import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";

export function useAppName(): string {
  const { data: settings } = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => {
      const res = await adminApi.getPublicSettings();
      return res.data!;
    },
    staleTime: 5 * 60 * 1000,
  });

  const appName = settings?.find((s) => s.key === "app_name")?.value as string | undefined;
  return appName || "Rncasp";
}
