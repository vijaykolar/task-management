import type { Types } from "mongoose";
import {
  TaskActivity,
  type TaskActivityType,
} from "../models/taskactivity.models.js";

export interface ActivityEntry {
  type: TaskActivityType;
  from?: unknown;
  to?: unknown;
  name?: string;
}

/**
 * Appends entries to a task's history. History is informational, so a
 * failure is logged rather than failing the user's request.
 */
export const logActivity = async (
  task: { _id: Types.ObjectId; project: Types.ObjectId },
  actor: Types.ObjectId,
  entries: ActivityEntry[],
) => {
  if (entries.length === 0) return;
  try {
    await TaskActivity.insertMany(
      entries.map((entry) => ({
        ...entry,
        task: task._id,
        project: task.project,
        actor,
      })),
    );
  } catch (error) {
    console.error("Failed to record task activity:", error);
  }
};
