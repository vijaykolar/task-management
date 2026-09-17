import type { Response } from "express";
import type { Types } from "mongoose";
import { ProjectMember } from "../models/projectmember.models.js";

/**
 * In-memory Server-Sent Events hub: userId -> open streams (one per tab).
 * Only reaches clients connected to this process; with several API instances
 * put a shared broker (e.g. Redis pub/sub) behind `publishToUsers`.
 */

export type ProjectEventScope =
  | "tasks"
  | "notes"
  | "sprints"
  | "members"
  | "project";

export type RealtimeEvent =
  | {
      type: "project.changed";
      scope: ProjectEventScope;
      projectId: string;
      taskId?: string;
      actorId: string;
    }
  | {
      type: "notification";
      kind: string;
      /** Missing for reminders the app sends on its own */
      actorName?: string;
      projectId: string;
      projectName: string;
      taskId?: string;
      taskTitle?: string;
      taskKey?: string;
      excerpt?: string;
    };

const clients = new Map<string, Set<Response>>();

export const addClient = (userId: string, res: Response) => {
  const streams = clients.get(userId) ?? new Set<Response>();
  streams.add(res);
  clients.set(userId, streams);
};

export const removeClient = (userId: string, res: Response) => {
  const streams = clients.get(userId);
  if (!streams) return;
  streams.delete(res);
  if (streams.size === 0) clients.delete(userId);
};

export const writeEvent = (
  res: Response,
  event: RealtimeEvent | { type: string },
) => {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
};

export const publishToUsers = (
  userIds: (string | Types.ObjectId)[],
  event: RealtimeEvent,
) => {
  for (const id of new Set(userIds.map(String))) {
    for (const res of clients.get(id) ?? []) {
      try {
        writeEvent(res, event);
      } catch {
        removeClient(id, res);
      }
    }
  }
};

export const projectMemberIds = async (projectId: string | Types.ObjectId) => {
  const memberships = await ProjectMember.find(
    { project: projectId },
    "user",
  ).lean();
  return memberships.map((membership) => String(membership.user));
};

export const connectedClientCount = () =>
  [...clients.values()].reduce((sum, streams) => sum + streams.size, 0);
