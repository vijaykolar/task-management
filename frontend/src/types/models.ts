// Mirrors backend/src/models/*.ts as serialized over JSON

export const UserRoles = {
  ADMIN: "admin",
  PROJECT_ADMIN: "project_admin",
  MEMBER: "member",
} as const;

export type UserRole = (typeof UserRoles)[keyof typeof UserRoles];

export const AvailableUserRoles: UserRole[] = Object.values(UserRoles);

export interface UserAvatar {
  url: string;
  localPath: string;
}

export interface User {
  _id: string;
  avatar: UserAvatar;
  username: string;
  email: string;
  fullName?: string;
  isEmailVerified: boolean;
  /** Email me about assignments and mentions */
  emailNotifications: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The public subset of a user returned by aggregation lookups */
export type UserSummary = Pick<
  User,
  "_id" | "username" | "fullName" | "avatar"
>;

/** One column of a project's workflow */
export interface ProjectStatus {
  /** Stable id stored on tasks */
  key: string;
  name: string;
  category: StatusCategory;
  /** Removed from the workflow; kept so history stays readable */
  archived?: boolean;
}

export interface Project {
  _id: string;
  name: string;
  /** Ticket key prefix, e.g. SPST */
  key: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- Pagination ----------

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

export type SortOrder = "asc" | "desc";

export interface ListParams<S extends string = string> {
  page?: number;
  limit?: number;
  sort?: S;
  order?: SortOrder;
  search?: string;
}

// ---------- Projects ----------

/** An item of GET /projects */
export interface ProjectListItem {
  project: Pick<
    Project,
    | "_id"
    | "name"
    | "key"
    | "description"
    | "createdAt"
    | "updatedAt"
    | "createdBy"
  > & { members: number };
  role: UserRole;
  isOwner: boolean;
}

export interface ProjectsResponse extends Paginated<ProjectListItem> {
  stats: { totalProjects: number; adminProjects: number; totalSeats: number };
}

/** GET /projects/:projectId — includes the caller's role */
export interface ProjectDetail extends Project {
  /** Workflow in board order, including archived statuses */
  statuses: ProjectStatus[];
  /** The key can't change once tasks use it */
  keyLocked: boolean;
  members: number;
  role: UserRole;
  isOwner: boolean;
}

/** An item of GET /projects/:projectId/members */
export interface ProjectMember {
  project: string;
  user: UserSummary;
  role: UserRole;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Pending invitation for an email that has no account yet */
export interface ProjectInvite {
  _id: string;
  project: string;
  email: string;
  role: UserRole;
  invitedBy?: UserSummary;
  status: "pending" | "accepted";
  isExpired: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface AddMemberResult {
  status: "added" | "updated" | "invited";
}

/** Tokens are set as httpOnly cookies and never included in the body */
export interface LoginResult {
  user: User;
}

// ---------- Tasks ----------

/** Every status belongs to a category; "done" checks use the category */
export const StatusCategories = {
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  DONE: "done",
} as const;

export type StatusCategory =
  (typeof StatusCategories)[keyof typeof StatusCategories];

export const AvailableStatusCategories: StatusCategory[] =
  Object.values(StatusCategories);

/** A status key from the project's workflow */
export type TaskStatus = string;

export const TaskTypes = {
  TASK: "task",
  STORY: "story",
  BUG: "bug",
  EPIC: "epic",
} as const;

export type TaskType = (typeof TaskTypes)[keyof typeof TaskTypes];

export const AvailableTaskTypes: TaskType[] = Object.values(TaskTypes);

/** `{ _id, key, title }` of a task referenced from another one */
export interface TaskRef {
  _id: string;
  key: string;
  title: string;
}

export const TaskPriorities = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export type TaskPriority = (typeof TaskPriorities)[keyof typeof TaskPriorities];

/** Least to most important */
export const AvailableTaskPriorities: TaskPriority[] =
  Object.values(TaskPriorities);

// Mirrors backend/src/utils/constants.ts
export const MAX_TASK_LABELS = 10;
export const MAX_LABEL_LENGTH = 30;

export interface TaskAttachment {
  _id: string;
  url: string;
  name: string;
  mimetype: string;
  size: number;
}

/** An item of GET /tasks/:projectId */
export interface TaskListItem {
  _id: string;
  /** Ticket key, e.g. SPST-12 */
  key: string;
  number: number;
  type: TaskType;
  title: string;
  description?: string;
  project: string;
  status: TaskStatus;
  statusCategory: StatusCategory;
  priority: TaskPriority;
  /** ISO date at 12:00 UTC; the calendar day is `dueDate.slice(0, 10)` */
  dueDate?: string;
  labels: string[];
  /** Missing = unestimated */
  storyPoints?: number;
  /** Sprint id; missing = backlog */
  sprint?: string;
  epic?: TaskRef;
  /** Unfinished tasks blocking this one */
  blockedByCount: number;
  assignedTo?: UserSummary;
  assignedBy?: string;
  subtaskCount: number;
  completedSubtaskCount: number;
  attachmentCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  _id: string;
  title: string;
  task: string;
  isCompleted: boolean;
  createdBy?: UserSummary;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSummary {
  total: number;
  todo: number;
  in_progress: number;
  done: number;
  overdue: number;
  assignedToMeOpen: number;
}

export interface TasksResponse extends Paginated<TaskListItem> {
  summary: TaskSummary;
}

/** GET /tasks/:projectId/t/:taskId */
export interface TaskDetail {
  _id: string;
  key: string;
  number: number;
  type: TaskType;
  title: string;
  description?: string;
  project: string;
  status: TaskStatus;
  statusCategory: StatusCategory;
  priority: TaskPriority;
  dueDate?: string;
  labels: string[];
  storyPoints?: number;
  sprint?: string;
  epic?: TaskRef;
  blockedByCount: number;
  /** Child issues, for epics */
  childCount: number;
  doneChildCount: number;
  assignedTo?: UserSummary;
  assignedBy?: UserSummary;
  attachments: TaskAttachment[];
  subtasks: Subtask[];
  createdAt: string;
  updatedAt: string;
}

// ---------- Notes ----------

export interface Note {
  _id: string;
  project: string;
  /** Sanitized rich text HTML */
  content: string;
  /** Plain text of `content`, for previews */
  contentText: string;
  createdBy?: UserSummary;
  createdAt: string;
  updatedAt: string;
}

// ---------- Task comments ----------

export interface TaskComment {
  _id: string;
  task: string;
  project: string;
  author?: UserSummary;
  /** Sanitized rich text HTML */
  body: string;
  editedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- Task activity (history) ----------

export type TaskActivityType =
  | "created"
  | "title_changed"
  | "description_changed"
  | "status_changed"
  | "priority_changed"
  | "assignee_changed"
  | "due_date_changed"
  | "labels_changed"
  | "attachment_added"
  | "attachment_removed"
  | "subtask_added"
  | "subtask_completed"
  | "subtask_reopened"
  | "subtask_deleted"
  | "comment_added"
  | "sprint_changed"
  | "points_changed"
  | "type_changed"
  | "epic_changed"
  | "link_added"
  | "link_removed"
  | "deleted";

export interface TaskActivity {
  _id: string;
  task: string;
  actor?: UserSummary;
  type: TaskActivityType;
  from?: unknown;
  to?: unknown;
  name?: string;
  createdAt: string;
}

// ---------- Notifications ----------

export type NotificationType = "task_assigned" | "task_commented" | "mentioned";

export interface AppNotification {
  _id: string;
  type: NotificationType;
  actor?: UserSummary;
  project: string;
  task?: string;
  projectName: string;
  taskTitle?: string;
  excerpt?: string;
  readAt?: string;
  createdAt: string;
}

export interface NotificationsResponse extends Paginated<AppNotification> {
  unreadCount: number;
}

// ---------- Sprints ----------

export type SprintStatus = "planned" | "active" | "completed";

export interface Sprint {
  _id: string;
  project: string;
  name: string;
  goal?: string;
  /** ISO dates at 12:00 UTC (calendar days) */
  startDate?: string;
  endDate?: string;
  status: SprintStatus;
  startedAt?: string;
  completedAt?: string;
  taskCount: number;
  doneCount: number;
  pointCount: number;
  donePoints: number;
  createdAt: string;
}

export interface SprintsResponse {
  sprints: Sprint[];
  backlog: {
    taskCount: number;
    doneCount: number;
    pointCount: number;
    donePoints: number;
  };
}

// ---------- Reports ----------

export interface Tally {
  count: number;
  points: number;
}

export interface ReportTask {
  _id: string;
  key?: string;
  title: string;
  status: TaskStatus;
  storyPoints: number | null;
  deleted: boolean;
  addedAt?: string;
  removedAt?: string;
  doneAtStart?: boolean;
}

/** GET /reports/:projectId/sprints/:sprintId */
export interface SprintReport {
  sprint: Pick<
    Sprint,
    | "_id"
    | "name"
    | "goal"
    | "status"
    | "startDate"
    | "endDate"
    | "startedAt"
    | "completedAt"
  >;
  /** Rebuilt from history for sprints started before reports existed */
  approximate: boolean;
  timeZone: string;
  summary: {
    committed: Tally;
    completed: Tally;
    added: Tally;
    removed: Tally;
    carriedOver: Tally;
    /** Point changes to committed tasks during the sprint */
    estimateDelta: number;
    unestimated: number;
  };
  /** First point is "start", then one per calendar day; future days are null */
  series: {
    date: string;
    scope: Tally | null;
    done: Tally | null;
    remaining: Tally | null;
  }[];
  tasks: {
    completed: ReportTask[];
    carriedOver: ReportTask[];
    added: ReportTask[];
    removed: ReportTask[];
  };
}

/** GET /reports/:projectId/velocity */
export interface VelocityReport {
  sprints: {
    _id: string;
    name: string;
    startDate?: string;
    endDate?: string;
    completedAt?: string;
    committed: Tally;
    completed: Tally;
    approximate: boolean;
  }[];
  average: Tally;
}

export type ReportUnit = keyof Tally;

// ---------- My work ----------

export interface MyTask extends Omit<
  TaskListItem,
  | "project"
  | "assignedTo"
  | "subtaskCount"
  | "completedSubtaskCount"
  | "commentCount"
  | "blockedByCount"
> {
  project: Pick<Project, "_id" | "name" | "key"> & {
    statuses: ProjectStatus[];
  };
}

export interface MyTasksResponse extends Paginated<MyTask> {
  summary: { open: number; done: number; overdue: number; dueThisWeek: number };
}

// ---------- Global search ----------

export interface SearchResults {
  query: string;
  projects: { _id: string; name: string; description?: string }[];
  tasks: {
    _id: string;
    key: string;
    type: TaskType;
    title: string;
    status: TaskStatus;
    statusCategory: StatusCategory;
    priority: TaskPriority;
    dueDate?: string;
    project: { _id: string; name: string; statuses: ProjectStatus[] };
  }[];
  notes: {
    _id: string;
    excerpt: string;
    updatedAt: string;
    project: { _id: string; name: string };
  }[];
}

// ---------- Task links ----------

export const TaskLinkTypes = {
  BLOCKS: "blocks",
  RELATES_TO: "relates_to",
  DUPLICATES: "duplicates",
} as const;

export type TaskLinkType = (typeof TaskLinkTypes)[keyof typeof TaskLinkTypes];

/** A link as seen from one task: outward = "blocks", inward = "is blocked by" */
export interface TaskLink {
  _id: string;
  type: TaskLinkType;
  direction: "outward" | "inward";
  task: TaskRef & {
    type: TaskType;
    status: TaskStatus;
    statusCategory: StatusCategory;
    priority: TaskPriority;
  };
  createdAt: string;
}

// ---------- Saved filters & bulk edits ----------

export interface SavedFilter {
  _id: string;
  name: string;
  filters: Record<string, string>;
  createdAt: string;
}

export interface BulkResult {
  updated: number;
  failed: { taskId: string; key?: string; message: string }[];
}
