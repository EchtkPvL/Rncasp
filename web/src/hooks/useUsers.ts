import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import type { CreateDummyRequest, UpdateDummyRequest, CreateUserRequest } from "@/api/types";

export function useUsers(params?: { role?: string; account_type?: string; exclude_account_type?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: async () => {
      const res = await usersApi.list(params);
      return res.data!;
    },
  });
}

export function useDummyAccounts() {
  return useQuery({
    queryKey: ["users", { account_type: "dummy" }],
    queryFn: async () => {
      const res = await usersApi.list({ account_type: "dummy", limit: 200 });
      return res.data!;
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserRequest) => usersApi.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useCreateDummy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDummyRequest) => usersApi.createDummy(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateDummy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UpdateDummyRequest }) =>
      usersApi.updateDummy(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteDummy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => usersApi.deleteDummy(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ["users", "search", query],
    queryFn: async () => {
      const res = await usersApi.search(query);
      return res.data!;
    },
    enabled: query.length >= 1,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: { role?: string; is_active?: boolean; full_name?: string; display_name?: string; email?: string; password?: string } }) =>
      usersApi.updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDisableUserTotp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => usersApi.disableUserTotp(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

// Alias for backward compat
export const useUpdateUserRole = useUpdateUser;
