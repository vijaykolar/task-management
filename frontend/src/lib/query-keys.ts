// Centralized query keys — add a factory per feature as you build it.
// Keys with params nest under a params-less root so the whole group can be
// invalidated with the root (e.g. every members page of a project).
export const queryKeys = {
  health: {
    all: ["health"] as const,
  },
  auth: {
    all: ["auth"] as const,
    currentUser: () => [...queryKeys.auth.all, "current-user"] as const,
    verifyEmail: (token: string) =>
      [...queryKeys.auth.all, "verify-email", token] as const,
  },
  projects: {
    all: ["projects"] as const,
    lists: () => [...queryKeys.projects.all, "list"] as const,
    list: (params: object) => [...queryKeys.projects.lists(), params] as const,
    detail: (projectId: string) =>
      [...queryKeys.projects.all, "detail", projectId] as const,
    members: (projectId: string) =>
      [...queryKeys.projects.all, "members", projectId] as const,
    memberPage: (projectId: string, params: object) =>
      [...queryKeys.projects.members(projectId), params] as const,
    invites: (projectId: string) =>
      [...queryKeys.projects.all, "invites", projectId] as const,
  },
  tasks: {
    all: ["tasks"] as const,
    project: (projectId: string) =>
      [...queryKeys.tasks.all, projectId] as const,
    columns: (projectId: string) =>
      [...queryKeys.tasks.project(projectId), "column"] as const,
    column: (projectId: string, params: object) =>
      [...queryKeys.tasks.columns(projectId), params] as const,
    summary: (projectId: string) =>
      [...queryKeys.tasks.project(projectId), "summary"] as const,
    detail: (projectId: string, taskId: string) =>
      [...queryKeys.tasks.project(projectId), "detail", taskId] as const,
    labels: (projectId: string) =>
      [...queryKeys.tasks.project(projectId), "labels"] as const,
    activity: (projectId: string, taskId: string) =>
      [...queryKeys.tasks.project(projectId), "activity", taskId] as const,
    comments: (projectId: string, taskId: string) =>
      [...queryKeys.tasks.project(projectId), "comments", taskId] as const,
    commentPage: (projectId: string, taskId: string, params: object) =>
      [...queryKeys.tasks.comments(projectId, taskId), params] as const,
    // Reports are derived from tasks, so every task or sprint change (which
    // invalidates the project's tasks) refreshes them too
    reports: (projectId: string) =>
      [...queryKeys.tasks.project(projectId), "reports"] as const,
    sprintReport: (projectId: string, sprintId: string, timeZone: string) =>
      [
        ...queryKeys.tasks.reports(projectId),
        "sprint",
        sprintId,
        timeZone,
      ] as const,
    velocity: (projectId: string, limit: number) =>
      [...queryKeys.tasks.reports(projectId), "velocity", limit] as const,
  },
  sprints: {
    all: ["sprints"] as const,
    project: (projectId: string) =>
      [...queryKeys.sprints.all, projectId] as const,
  },
  myWork: {
    all: ["my-work"] as const,
    list: (params: object) => [...queryKeys.myWork.all, params] as const,
  },
  search: {
    all: ["search"] as const,
    query: (q: string) => [...queryKeys.search.all, q] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: (params: object) =>
      [...queryKeys.notifications.all, "list", params] as const,
  },
  notes: {
    all: ["notes"] as const,
    project: (projectId: string) =>
      [...queryKeys.notes.all, projectId] as const,
    lists: (projectId: string) =>
      [...queryKeys.notes.project(projectId), "list"] as const,
    list: (projectId: string, params: object) =>
      [...queryKeys.notes.lists(projectId), params] as const,
    detail: (projectId: string, noteId: string) =>
      [...queryKeys.notes.project(projectId), "detail", noteId] as const,
  },
} as const;
