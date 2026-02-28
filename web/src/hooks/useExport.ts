import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { exportApi } from "@/api/export";
import type { CreateICalTokenRequest, PrintConfig } from "@/api/types";

export function useICalTokens() {
  return useQuery({
    queryKey: ["ical-tokens"],
    queryFn: exportApi.listTokens,
  });
}

export function useCreateICalToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateICalTokenRequest) => exportApi.createToken(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ical-tokens"] });
    },
  });
}

export function useRevokeICalToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => exportApi.revokeToken(tokenId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ical-tokens"] });
    },
  });
}

export function useDownloadPDF() {
  return useMutation({
    mutationFn: async ({ slug, config }: { slug: string; config: PrintConfig }) => {
      const blob = await exportApi.downloadPDF(slug, config);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-shifts.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}
