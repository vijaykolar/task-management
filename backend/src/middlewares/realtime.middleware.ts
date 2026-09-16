import type { RequestHandler } from "express";
import mongoose from "mongoose";
import {
  projectMemberIds,
  publishToUsers,
  type ProjectEventScope,
} from "../utils/realtime.js";

/**
 * Tells everyone in the project that something changed once a mutating
 * request succeeds, so their open pages refetch. Members are looked up before
 * the handler runs, so people being removed (or a project being deleted)
 * still hear about it.
 */
export const broadcastProjectChange =
  (scope: ProjectEventScope): RequestHandler<any> =>
  async (req, res, next) => {
    const projectId: unknown = req.params.projectId;
    if (typeof projectId !== "string" || !mongoose.isValidObjectId(projectId)) {
      return next();
    }

    let recipients: string[] = [];
    try {
      recipients = await projectMemberIds(projectId);
    } catch {
      return next();
    }

    res.on("finish", () => {
      if (res.statusCode >= 400 || !req.user) return;
      publishToUsers(recipients, {
        type: "project.changed",
        scope,
        projectId,
        taskId:
          typeof req.params.taskId === "string" ? req.params.taskId : undefined,
        actorId: String(req.user._id),
      });
    });
    next();
  };
