import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { http } from "@/lib/axios";
import { queryKeys } from "@/lib/query-keys";
import type { AppNotification, NotificationsResponse } from "@/types/models";

export interface NotificationParams {
  page?: number;
  limit?: number;
  unread?: boolean;
}

// Endpoints under /api/v1/notifications — see backend/src/routes/notification.routes.ts
export const notificationsApi = {
  list: ({ unread, ...params }: NotificationParams = {}) =>
    http.get<NotificationsResponse>("/notifications", {
      params: { ...params, ...(unread && { unread: "true" }) },
    }),
  markRead: (notificationId: string) =>
    http.patch<AppNotification>(`/notifications/${notificationId}/read`),
  markAllRead: () => http.post<{ updated: number }>("/notifications/read-all"),
};

const POLL_INTERVAL = 30_000;

/** Notifications page (also used by the header bell with a small limit) */
export function useNotifications(
  params: NotificationParams = {},
  { poll = false }: { poll?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.notifications.list(params),
    queryFn: () => notificationsApi.list(params).then((res) => res.data),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    refetchInterval: poll ? POLL_INTERVAL : false,
    refetchOnWindowFocus: poll,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      notificationsApi.markRead(notificationId),
    meta: { silent: true },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    meta: { successMessage: "All notifications marked as read" },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}

/** In-app link to what a notification is about */
export function notificationHref(notification: AppNotification) {
  return notification.task
    ? `/projects/${notification.project}?tab=tasks&task=${notification.task}`
    : `/projects/${notification.project}`;
}
