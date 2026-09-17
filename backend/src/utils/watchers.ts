import type { Types } from "mongoose";
import { Task } from "../models/task.models.js";

/** Adds people to a task's watchers (ignores empty ids and duplicates) */
export const addWatchers = async (
  taskId: Types.ObjectId,
  userIds: (Types.ObjectId | undefined | null)[],
) => {
  const ids = userIds.filter((id): id is Types.ObjectId => !!id);
  if (ids.length === 0) return;
  // Not a user-visible edit, so leave updatedAt alone
  await Task.updateOne(
    { _id: taskId },
    { $addToSet: { watchers: { $each: ids } } },
    { timestamps: false },
  );
};

/** Current watchers of a task */
export const watchersOf = async (taskId: Types.ObjectId) =>
  (await Task.findById(taskId, "watchers").lean())?.watchers ?? [];
