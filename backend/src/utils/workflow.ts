import type { Types } from "mongoose";
import {
  DEFAULT_STATUSES,
  Project,
  type IProjectStatus,
} from "../models/project.models.js";
import { ApiError } from "./api-error.js";
import { StatusCategoryEnum, type StatusCategory } from "./constants.js";

// ---------- Ticket keys ----------

export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
export const TASK_KEY_PATTERN = /^([A-Z][A-Z0-9]{1,9})-(\d+)$/;

/** "Sprint Planning Tool" -> "SPT", "Website" -> "WEBS" */
export const suggestProjectKey = (name: string) => {
  const words = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let key =
    words.length >= 2
      ? words.map((word) => word[0]).join("")
      : (words[0] ?? "").slice(0, 4);
  key = key.toUpperCase().slice(0, 6);
  if (!/^[A-Z]/.test(key)) key = `P${key}`;
  if (key.length < 2) key = `${key}PRJ`.slice(0, 4);
  return key;
};

/** `base`, or `base2`, `base3`… whichever is free */
export const uniqueProjectKey = async (base: string) => {
  const stem = base.slice(0, 8);
  for (let suffix = 1; suffix < 1000; suffix++) {
    const candidate = suffix === 1 ? stem : `${stem}${suffix}`;
    if (!(await Project.exists({ key: candidate }))) return candidate;
  }
  throw new ApiError(500, "Couldn't generate a project key");
};

/** Reserves the next ticket number atomically, so concurrent creates never clash */
export const reserveTaskNumber = async (projectId: Types.ObjectId) => {
  const project = await Project.findByIdAndUpdate(
    projectId,
    { $inc: { taskCounter: 1 } },
    { new: true, projection: { key: 1, taskCounter: 1 } },
  ).lean();
  if (!project) throw new ApiError(404, "Project not found");
  return {
    number: project.taskCounter,
    key: `${project.key}-${project.taskCounter}`,
  };
};

// ---------- Statuses ----------

export const projectStatuses = (project: {
  statuses?: IProjectStatus[] | null;
}) =>
  project.statuses?.length
    ? project.statuses
    : DEFAULT_STATUSES.map((status) => ({ ...status }));

export const activeStatuses = (project: {
  statuses?: IProjectStatus[] | null;
}) => projectStatuses(project).filter((status) => !status.archived);

/**
 * Category of a status key. Unknown keys (e.g. from very old history) fall
 * back to the legacy statuses, then to "to do".
 */
export const categoryLookup = (statuses: IProjectStatus[]) => {
  const byKey = new Map(statuses.map((status) => [status.key, status]));
  return (key: unknown): StatusCategory => {
    const status = byKey.get(String(key));
    if (status) return status.category;
    if (key === StatusCategoryEnum.DONE) return StatusCategoryEnum.DONE;
    if (key === StatusCategoryEnum.IN_PROGRESS) {
      return StatusCategoryEnum.IN_PROGRESS;
    }
    return StatusCategoryEnum.TODO;
  };
};

/** Resolves a status key for a task; empty means the first "to do" status */
export const resolveStatus = (
  project: { statuses?: IProjectStatus[] | null },
  value: unknown,
): IProjectStatus => {
  const statuses = activeStatuses(project);
  if (value === undefined || value === null || value === "") {
    return (
      statuses.find((status) => status.category === StatusCategoryEnum.TODO) ??
      statuses[0]!
    );
  }
  const status = statuses.find((status) => status.key === value);
  if (!status) {
    throw new ApiError(422, "Status is not part of this project's workflow");
  }
  return status;
};

/** A new status key from its name, unique within the project (incl. archived) */
export const newStatusKey = (name: string, taken: Set<string>) => {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "status";
  let key = base;
  for (let suffix = 2; taken.has(key); suffix++) key = `${base}_${suffix}`;
  taken.add(key);
  return key;
};
