import type { Types } from "mongoose";
import { Sprint } from "../models/sprint.models.js";
import { ApiError } from "./api-error.js";
import { toObjectId } from "./object-id.js";

export const findSprintInProject = async (
  projectId: string,
  sprintId: string,
) => {
  const sprint = await Sprint.findOne({
    _id: toObjectId(sprintId, "sprint id"),
    project: toObjectId(projectId, "project id"),
  });
  if (!sprint) {
    throw new ApiError(404, "Sprint not found");
  }
  return sprint;
};

/** `{ _id, name }` snapshot of a sprint for activity history (null = backlog) */
export const sprintSnapshot = async (
  sprintId: Types.ObjectId | undefined | null,
) => {
  if (!sprintId) return null;
  const sprint = await Sprint.findById(sprintId, "name").lean();
  return sprint ? { _id: sprint._id, name: sprint.name } : null;
};
