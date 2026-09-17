import { useSyncExternalStore } from "react";

import type { NotificationType } from "@/types/models";

export type RealtimeStatus = "connecting" | "open" | "closed";

export type ProjectEventScope =
  "tasks" | "notes" | "sprints" | "members" | "project";

// Mirrors backend/src/utils/realtime.ts
export type RealtimeEvent =
  | { type: "connected" }
  | {
      type: "project.changed";
      scope: ProjectEventScope;
      projectId: string;
      taskId?: string;
      actorId: string;
    }
  | {
      type: "notification";
      kind: NotificationType;
      /** Missing for reminders the app sends itself */
      actorName?: string;
      projectId: string;
      projectName: string;
      taskId?: string;
      taskTitle?: string;
      taskKey?: string;
      excerpt?: string;
    };

// Tiny external store so any component can read the connection status
let status: RealtimeStatus = "closed";
const listeners = new Set<() => void>();

export function setRealtimeStatus(next: RealtimeStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((listener) => listener());
}

/** "open" while live updates are flowing; polling can pause meanwhile */
export function useRealtimeStatus() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
  );
}
