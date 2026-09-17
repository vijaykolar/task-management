import { http } from "@/lib/axios";
import type {
  BulkResult,
  MyTasksResponse,
  SavedFilter,
  StatusCategory,
  TaskLink,
  TaskLinkType,
  TaskType,
  Paginated,
  SortOrder,
  TaskActivity,
  TaskComment,
  TaskPriority,
  ListParams,
  Subtask,
  TaskDetail,
  TasksResponse,
  TaskStatus,
} from "@/types/models";

export type TaskSort =
  "createdAt" | "updatedAt" | "title" | "dueDate" | "priority" | "key" | "rank";

export interface TaskListParams extends ListParams<TaskSort> {
  /** A status key from the workflow */
  status?: TaskStatus;
  category?: StatusCategory;
  /** "work" = every type except epics (boards and sprints) */
  type?: TaskType | "work";
  /** Epic id or "none" */
  epic?: string;
  /** "me", "unassigned" or a user id */
  assignee?: string;
  priority?: TaskPriority;
  label?: string;
  due?: "overdue" | "week" | "none";
  /** "backlog", "active" or a sprint id */
  sprint?: string;
}

export interface MyTaskParams {
  status?: "open" | "done" | "all";
  priority?: TaskPriority;
  search?: string;
  sort?: "dueDate" | "priority" | "updatedAt";
  order?: SortOrder;
  page?: number;
  limit?: number;
}

export interface TaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  type?: TaskType;
  /** Epic id; "" removes the task from its epic */
  epic?: string;
  /** User id; empty string unassigns */
  assignedTo?: string;
  priority?: TaskPriority;
  /** `YYYY-MM-DD`; empty string clears the due date */
  dueDate?: string;
  labels?: string[];
  /** "" clears the estimate */
  storyPoints?: number | "";
  /** Sprint id; "" moves the task to the backlog */
  sprint?: string;
  /** New files to attach */
  files?: File[];
}

export interface LinkInput {
  type: TaskLinkType;
  /** Task id or ticket key */
  target: string;
  /** inward = "this task is blocked by / duplicated by target" */
  direction: "outward" | "inward";
}

/** Where a dragged task lands: in `sprint`, after or before a neighbour */
export interface RankInput {
  /** Sprint id; "" = backlog */
  sprint: string;
  afterId?: string;
  beforeId?: string;
}

export interface BulkChanges {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string;
  sprint?: string;
  type?: TaskType;
  epic?: string;
  addLabels?: string[];
  removeLabels?: string[];
}

export interface SubtaskInput {
  title?: string;
  isCompleted?: boolean;
}

/** Sends multipart when files are present (multer), JSON otherwise */
function toBody({ files, ...fields }: TaskInput) {
  if (!files?.length) return fields;

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    // Arrays (labels) travel as JSON in multipart forms
    form.append(
      key,
      Array.isArray(value) ? JSON.stringify(value) : String(value),
    );
  }
  for (const file of files) form.append("attachments", file);
  return form;
}

// Endpoints under /api/v1/tasks — see backend/src/routes/task.routes.ts
export const tasksApi = {
  list: (projectId: string, params: TaskListParams = {}) =>
    http.get<TasksResponse>(`/tasks/${projectId}`, { params }),

  mine: (params: MyTaskParams = {}) =>
    http.get<MyTasksResponse>("/tasks/me", { params }),

  get: (projectId: string, taskId: string) =>
    http.get<TaskDetail>(`/tasks/${projectId}/t/${taskId}`),

  /** Resolves a ticket key like SPST-12 to its task and project */
  byKey: (key: string) =>
    http.get<{ _id: string; key: string; project: string }>(
      `/tasks/key/${encodeURIComponent(key)}`,
    ),

  rank: (projectId: string, taskId: string, input: RankInput) =>
    http.put<{ _id: string; rank: number; sprint: string | null }>(
      `/tasks/${projectId}/t/${taskId}/rank`,
      input,
    ),

  bulk: (
    projectId: string,
    body:
      | { taskIds: string[]; action: "update"; changes: BulkChanges }
      | { taskIds: string[]; action: "delete" },
  ) => http.post<BulkResult>(`/tasks/${projectId}/bulk`, body),

  links: (projectId: string, taskId: string) =>
    http.get<TaskLink[]>(`/tasks/${projectId}/t/${taskId}/links`),

  addLink: (projectId: string, taskId: string, body: LinkInput) =>
    http.post<TaskLink>(`/tasks/${projectId}/t/${taskId}/links`, body),

  removeLink: (projectId: string, linkId: string) =>
    http.delete<Record<string, never>>(`/tasks/${projectId}/links/${linkId}`),

  savedFilters: (projectId: string) =>
    http.get<SavedFilter[]>(`/tasks/${projectId}/filters`),

  saveFilter: (
    projectId: string,
    body: { name: string; filters: Record<string, string> },
  ) => http.post<SavedFilter>(`/tasks/${projectId}/filters`, body),

  deleteFilter: (projectId: string, filterId: string) =>
    http.delete<Record<string, never>>(
      `/tasks/${projectId}/filters/${filterId}`,
    ),

  create: (projectId: string, input: TaskInput) =>
    http.post<{ _id: string }>(`/tasks/${projectId}`, toBody(input), {
      timeout: 60_000,
    }),

  update: (projectId: string, taskId: string, input: TaskInput) =>
    http.put<{ _id: string }>(
      `/tasks/${projectId}/t/${taskId}`,
      toBody(input),
      {
        timeout: 60_000,
      },
    ),

  remove: (projectId: string, taskId: string) =>
    http.delete<unknown>(`/tasks/${projectId}/t/${taskId}`),

  removeAttachment: (projectId: string, taskId: string, attachmentId: string) =>
    http.delete<unknown>(
      `/tasks/${projectId}/t/${taskId}/attachments/${attachmentId}`,
    ),

  createSubtask: (projectId: string, taskId: string, title: string) =>
    http.post<Subtask>(`/tasks/${projectId}/t/${taskId}/subtasks`, { title }),

  updateSubtask: (projectId: string, subtaskId: string, input: SubtaskInput) =>
    http.put<Subtask>(`/tasks/${projectId}/st/${subtaskId}`, input),

  labels: (projectId: string) =>
    http.get<string[]>(`/tasks/${projectId}/labels`),

  activity: (
    projectId: string,
    taskId: string,
    params: { page?: number; limit?: number } = {},
  ) =>
    http.get<Paginated<TaskActivity>>(
      `/tasks/${projectId}/t/${taskId}/activity`,
      { params },
    ),

  comments: (
    projectId: string,
    taskId: string,
    params: { page?: number; limit?: number; order?: SortOrder } = {},
  ) =>
    http.get<Paginated<TaskComment>>(
      `/tasks/${projectId}/t/${taskId}/comments`,
      { params },
    ),

  addComment: (projectId: string, taskId: string, body: string) =>
    http.post<TaskComment>(`/tasks/${projectId}/t/${taskId}/comments`, {
      body,
    }),

  updateComment: (projectId: string, commentId: string, body: string) =>
    http.put<TaskComment>(`/tasks/${projectId}/comments/${commentId}`, {
      body,
    }),

  removeComment: (projectId: string, commentId: string) =>
    http.delete<Record<string, never>>(
      `/tasks/${projectId}/comments/${commentId}`,
    ),

  removeSubtask: (projectId: string, subtaskId: string) =>
    http.delete<Subtask>(`/tasks/${projectId}/st/${subtaskId}`),
};
