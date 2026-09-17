export const UserRolesEnum = {
  ADMIN: "admin",
  PROJECT_ADMIN: "project_admin",
  MEMBER: "member",
} as const;

export type UserRole = (typeof UserRolesEnum)[keyof typeof UserRolesEnum];

export const AvailableUserRole: UserRole[] = Object.values(UserRolesEnum);

export const isUserRole = (value: unknown): value is UserRole =>
  typeof value === "string" && AvailableUserRole.includes(value as UserRole);

/**
 * Every project status belongs to one of these categories. Code that needs to
 * know whether work is finished checks the category, never the status itself.
 */
export const StatusCategoryEnum = {
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  DONE: "done",
} as const;

export type StatusCategory =
  (typeof StatusCategoryEnum)[keyof typeof StatusCategoryEnum];

export const AvailableStatusCategories: StatusCategory[] =
  Object.values(StatusCategoryEnum);

/** Keys of the statuses every project starts with (also the legacy statuses) */
export const TaskStatusEnum = StatusCategoryEnum;

/** A status key from the project's workflow */
export type TaskStatus = string;

export const TaskTypeEnum = {
  TASK: "task",
  STORY: "story",
  BUG: "bug",
  EPIC: "epic",
} as const;

export type TaskType = (typeof TaskTypeEnum)[keyof typeof TaskTypeEnum];

export const AvailableTaskTypes: TaskType[] = Object.values(TaskTypeEnum);

export const TaskLinkTypeEnum = {
  BLOCKS: "blocks",
  RELATES_TO: "relates_to",
  DUPLICATES: "duplicates",
} as const;

export type TaskLinkType =
  (typeof TaskLinkTypeEnum)[keyof typeof TaskLinkTypeEnum];

export const AvailableTaskLinkTypes: TaskLinkType[] =
  Object.values(TaskLinkTypeEnum);

export const MAX_PROJECT_STATUSES = 12;
export const MAX_BULK_TASKS = 100;
export const MAX_SAVED_FILTERS = 20;

export const TaskPriorityEnum = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export type TaskPriority =
  (typeof TaskPriorityEnum)[keyof typeof TaskPriorityEnum];

/** Ordered from least to most important (used for sorting) */
export const AvailableTaskPriorities: TaskPriority[] =
  Object.values(TaskPriorityEnum);

export const MAX_TASK_LABELS = 10;
export const MAX_LABEL_LENGTH = 30;
