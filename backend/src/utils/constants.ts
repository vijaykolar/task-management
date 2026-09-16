export const UserRolesEnum = {
  ADMIN: "admin",
  PROJECT_ADMIN: "project_admin",
  MEMBER: "member",
} as const;

export type UserRole = (typeof UserRolesEnum)[keyof typeof UserRolesEnum];

export const AvailableUserRole: UserRole[] = Object.values(UserRolesEnum);

export const isUserRole = (value: unknown): value is UserRole =>
  typeof value === "string" && AvailableUserRole.includes(value as UserRole);

export const TaskStatusEnum = {
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  DONE: "done",
} as const;

export type TaskStatus = (typeof TaskStatusEnum)[keyof typeof TaskStatusEnum];

export const AvailableTaskStatues: TaskStatus[] = Object.values(TaskStatusEnum);

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
