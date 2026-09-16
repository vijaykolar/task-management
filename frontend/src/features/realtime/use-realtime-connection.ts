import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { env } from "@/config/env";
import {
  setRealtimeStatus,
  type RealtimeEvent,
} from "@/features/realtime/realtime";
import { http } from "@/lib/axios";
import { queryKeys } from "@/lib/query-keys";

const MAX_BACKOFF_MS = 30_000;

const notificationVerb = {
  task_assigned: "assigned you to",
  task_commented: "commented on",
  mentioned: "mentioned you in",
} as const;

function invalidateForProjectEvent(
  queryClient: QueryClient,
  event: Extract<RealtimeEvent, { type: "project.changed" }>,
) {
  const { projectId, scope } = event;
  const keys: (readonly unknown[])[] = [];

  switch (scope) {
    case "tasks":
      keys.push(queryKeys.tasks.project(projectId), queryKeys.myWork.all);
      break;
    case "sprints":
      keys.push(
        queryKeys.sprints.project(projectId),
        queryKeys.tasks.project(projectId),
      );
      break;
    case "notes":
      keys.push(queryKeys.notes.project(projectId));
      break;
    case "members":
      keys.push(
        queryKeys.projects.members(projectId),
        queryKeys.projects.invites(projectId),
        queryKeys.projects.detail(projectId),
        queryKeys.projects.lists(),
        queryKeys.myWork.all,
      );
      break;
    case "project":
      keys.push(
        queryKeys.projects.detail(projectId),
        queryKeys.projects.lists(),
      );
      break;
  }

  for (const queryKey of keys) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * Keeps one Server-Sent Events connection open while the user is signed in.
 * Other people's changes refresh the affected queries, and new notifications
 * show a toast. On disconnect it refreshes the session (the stream closes when
 * the access token expires) and reconnects with backoff.
 */
export function useRealtimeConnection(userId: string | undefined) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Latest navigate without reconnecting when it changes
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  });

  useEffect(() => {
    if (!userId || typeof EventSource === "undefined") return;

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let disposed = false;

    const handleEvent = (message: MessageEvent<string>) => {
      let event: RealtimeEvent;
      try {
        event = JSON.parse(message.data) as RealtimeEvent;
      } catch {
        return;
      }

      if (event.type === "connected") {
        attempt = 0;
        setRealtimeStatus("open");
        // Catch up on anything missed while disconnected
        void queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.all,
        });
        return;
      }

      if (event.type === "project.changed") {
        // Our own changes are already handled by the mutation that made them
        if (event.actorId === userId) return;
        invalidateForProjectEvent(queryClient, event);
        return;
      }

      if (event.type === "notification") {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.all,
        });
        const href = event.taskId
          ? `/projects/${event.projectId}?tab=tasks&task=${event.taskId}`
          : `/projects/${event.projectId}`;
        toast(
          `${event.actorName} ${notificationVerb[event.kind]} ${event.taskTitle ?? "a task"}`,
          {
            description: event.projectName,
            action: { label: "View", onClick: () => navigateRef.current(href) },
          },
        );
      }
    };

    const connect = () => {
      if (disposed) return;
      setRealtimeStatus("connecting");
      source = new EventSource(`${env.apiBaseUrl}/events`, {
        withCredentials: true,
      });
      source.onmessage = handleEvent;
      source.onerror = () => {
        source?.close();
        source = null;
        setRealtimeStatus("closed");
        if (disposed) return;

        const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
        attempt += 1;
        retryTimer = setTimeout(async () => {
          // A cheap authenticated call lets the axios interceptor refresh an
          // expired access token before reconnecting
          try {
            await http.get("/auth/current-user");
          } catch {
            // Offline or signed out: keep backing off
          }
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      source?.close();
      setRealtimeStatus("closed");
    };
  }, [userId, queryClient]);
}
