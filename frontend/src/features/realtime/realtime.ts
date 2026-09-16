import { useSyncExternalStore } from "react";

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
      kind: "task_assigned" | "task_commented" | "mentioned";
      actorName: string;
      projectId: string;
      projectName: string;
      taskId?: string;
      taskTitle?: string;
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
