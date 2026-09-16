import { UserRoles, type UserRole } from "@/types/models";

export const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  project_admin: "Project Admin",
  member: "Member",
};

export const roleDescriptions: Record<UserRole, string> = {
  admin: "Full access: edit or delete the project and manage its members",
  project_admin: "Manages tasks and project content",
  member: "Views the project and updates task progress",
};

// Permission matrix from PRD.md §4.2, as enforced by the backend routes
const TASK_MANAGERS = [UserRoles.ADMIN, UserRoles.PROJECT_ADMIN];
const EVERYONE = [UserRoles.ADMIN, UserRoles.PROJECT_ADMIN, UserRoles.MEMBER];

const permissions = {
  "project:update": [UserRoles.ADMIN],
  "project:delete": [UserRoles.ADMIN],
  "members:manage": [UserRoles.ADMIN],
  "task:manage": TASK_MANAGERS,
  "subtask:manage": TASK_MANAGERS,
  "subtask:toggle": EVERYONE,
  "note:manage": [UserRoles.ADMIN],
} satisfies Record<string, UserRole[]>;

export type Permission = keyof typeof permissions;

export function can(role: UserRole | undefined, permission: Permission) {
  return !!role && (permissions[permission] as UserRole[]).includes(role);
}
