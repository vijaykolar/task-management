import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";

import { authApi } from "@/features/auth/api";
import { ApiClientError } from "@/lib/axios";
import { queryKeys } from "@/lib/query-keys";
import type { User } from "@/types/models";

/** Drops every cached query except auth state, e.g. after logout */
export function clearSessionData(queryClient: QueryClient) {
  queryClient.setQueryData<User | null>(queryKeys.auth.currentUser(), null);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== queryKeys.auth.all[0],
  });
}

/**
 * The logged-in user, or `null` when there is no valid session.
 * A 401 is treated as "logged out" rather than as a query error.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.auth.currentUser(),
    queryFn: async (): Promise<User | null> => {
      try {
        const res = await authApi.currentUser();
        return res.data;
      } catch (error) {
        if (error instanceof ApiClientError && error.statusCode === 401) {
          return null;
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    meta: { silent: true },
    onSuccess: (res) => {
      queryClient.setQueryData(queryKeys.auth.currentUser(), res.data.user);
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: authApi.register,
    meta: { silent: true },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    meta: { silent: true },
    // Clear local session even if the server call fails
    onSettled: () => clearSessionData(queryClient),
  });
}

export function useVerifyEmail(token: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.auth.verifyEmail(token ?? ""),
    queryFn: async () => {
      const res = await authApi.verifyEmail(token!);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.auth.currentUser(),
      });
      return res;
    },
    enabled: !!token,
    // The token is single-use: never refetch
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useResendEmailVerification() {
  return useMutation({
    mutationFn: authApi.resendEmailVerification,
    // No success toast: the API answers identically for unknown emails, so
    // each screen words its own confirmation
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: authApi.forgotPassword,
    meta: { silent: true },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: authApi.resetPassword,
    meta: { silent: true },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: authApi.changePassword,
    meta: { silent: true, successMessage: "Password changed successfully" },
  });
}

// ---------- Profile ----------

/** Names and avatars appear in member lists, tasks and notes */
function useApplyUpdatedUser() {
  const queryClient = useQueryClient();
  return (user: User) => {
    queryClient.setQueryData(queryKeys.auth.currentUser(), user);
    return Promise.all(
      [queryKeys.projects.all, queryKeys.tasks.all, queryKeys.notes.all].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };
}

export function useUpdateAccount() {
  const applyUser = useApplyUpdatedUser();
  return useMutation({
    mutationFn: (body: {
      fullName?: string;
      emailNotifications?: boolean;
      timeZone?: string;
    }) => authApi.updateAccount(body).then((res) => res.data),
    meta: { silent: true, successMessage: "Profile updated" },
    onSuccess: applyUser,
  });
}

export function useUpdateAvatar() {
  const applyUser = useApplyUpdatedUser();
  return useMutation({
    mutationFn: (file: File) =>
      authApi.updateAvatar(file).then((res) => res.data),
    meta: { successMessage: "Avatar updated" },
    onSuccess: applyUser,
  });
}

export function useRemoveAvatar() {
  const applyUser = useApplyUpdatedUser();
  return useMutation({
    mutationFn: () => authApi.removeAvatar().then((res) => res.data),
    meta: { successMessage: "Avatar removed" },
    onSuccess: applyUser,
  });
}

/** The browser's time zone, e.g. "Asia/Kolkata" */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Keeps the signed-in user's stored time zone in step with their browser, so
 * due date reminders arrive on their local day. Runs once per change, quietly.
 */
export function useSyncTimeZone(user: User | undefined) {
  const queryClient = useQueryClient();
  const saved = user?.timeZone;
  const userId = user?._id;

  useEffect(() => {
    const timeZone = browserTimeZone();
    if (!userId || saved === timeZone) return;
    void authApi
      .updateAccount({ timeZone })
      .then((res) =>
        queryClient.setQueryData<User>(queryKeys.auth.currentUser(), res.data),
      )
      .catch(() => {
        // Not worth bothering anyone about; reminders fall back to UTC
      });
  }, [userId, saved, queryClient]);
}
