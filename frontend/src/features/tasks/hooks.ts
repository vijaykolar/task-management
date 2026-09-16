import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";

import {
  type MyTaskParams,
  tasksApi,
  type SubtaskInput,
  type TaskInput,
  type TaskListParams,
} from "@/features/tasks/api";
import { queryKeys } from "@/lib/query-keys";
import type {
  TaskDetail,
  TaskListItem,
  TasksResponse,
  TaskStatus,
} from "@/types/models";

type TaskPages = InfiniteData<TasksResponse, number>;
export type TaskFilters = Omit<TaskListParams, "page" | "status">;

const COLUMN_PAGE_SIZE = 20;

function invalidateProjectTasks(queryClient: QueryClient, projectId: string) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.tasks.project(projectId),
    }),
    // Sprint task counts and "My work" include these tasks too
    queryClient.invalidateQueries({
      queryKey: queryKeys.sprints.project(projectId),
    }),
    queryClient.invalidateQueries({ queryKey: queryKeys.myWork.all }),
  ]);
}

/** Every cached board column of a project, with the filters it was loaded with */
function getColumns(queryClient: QueryClient, projectId: string) {
  return queryClient
    .getQueriesData<TaskPages | TasksResponse>({
      queryKey: queryKeys.tasks.columns(projectId),
    })
    .map(([key, data]) => ({
      key,
      data,
      params: key.at(-1) as TaskListParams & { view?: string },
    }));
}

function findCachedTask(
  queryClient: QueryClient,
  projectId: string,
  taskId: string,
) {
  for (const { data } of getColumns(queryClient, projectId)) {
    const pages = !data ? [] : "pages" in data ? data.pages : [data];
    for (const page of pages) {
      const task = page.items.find((item) => item._id === taskId);
      if (task) return task;
    }
  }
  return undefined;
}

// ---------- Tasks ----------

/** One board column: tasks with a given status, loaded 20 at a time */
export function useTaskColumn(
  projectId: string,
  status: TaskStatus,
  filters: TaskFilters,
) {
  const params = { ...filters, status, limit: COLUMN_PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: queryKeys.tasks.column(projectId, params),
    queryFn: ({ pageParam }) =>
      tasksApi
        .list(projectId, { ...params, page: pageParam })
        .then((res) => res.data),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.hasNextPage ? last.pagination.page + 1 : undefined,
  });
}

/** Whole-project task counts (ignores board filters) */
export function useTaskSummary(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks.summary(projectId ?? ""),
    queryFn: () =>
      tasksApi.list(projectId!, { limit: 1 }).then((res) => res.data.summary),
    enabled: !!projectId,
  });
}

export function useTask(projectId: string, taskId: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.tasks.detail(projectId, taskId ?? ""),
    queryFn: () => tasksApi.get(projectId, taskId!).then((res) => res.data),
    enabled: !!taskId,
    // Show the card's data instantly while the full task loads
    placeholderData: () => {
      const item = taskId && findCachedTask(queryClient, projectId, taskId);
      return item
        ? { ...item, assignedBy: undefined, attachments: [], subtasks: [] }
        : undefined;
    },
  });
}

export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskInput) =>
      tasksApi.create(projectId, input).then((res) => res.data),
    meta: { silent: true, successMessage: "Task created" },
    onSuccess: () => invalidateProjectTasks(queryClient, projectId),
  });
}

export function useUpdateTask(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, ...input }: TaskInput & { taskId: string }) =>
      tasksApi.update(projectId, taskId, input).then((res) => res.data),
    // Optimistic status change: move the card between columns right away
    onMutate: async ({ taskId, status }) => {
      if (!status) return undefined;
      await queryClient.cancelQueries({
        queryKey: queryKeys.tasks.project(projectId),
      });

      const columns = getColumns(queryClient, projectId);
      const task = findCachedTask(queryClient, projectId, taskId);
      if (!task) return undefined;
      const moved: TaskListItem = { ...task, status };

      for (const { key, data, params } of columns) {
        if (!data) continue;
        // List view caches one page (not infinite pages): move rows in place
        if (!("pages" in data)) {
          queryClient.setQueryData<TasksResponse>(key, {
            ...data,
            items: data.items.map((item) =>
              item._id === taskId ? { ...item, status } : item,
            ),
          });
          continue;
        }
        // Views not split by status (backlog sections) just update the row
        if (params.status === undefined) {
          queryClient.setQueryData<TaskPages>(key, {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item._id === taskId ? moved : item,
              ),
            })),
          });
          continue;
        }
        // Board columns: remove from the old column, prepend to the new one
        const pages = data.pages.map((page) => ({
          ...page,
          items: page.items.filter((item) => item._id !== taskId),
        }));
        if (params.status === status && pages[0]) {
          pages[0] = { ...pages[0], items: [moved, ...pages[0].items] };
        }
        queryClient.setQueryData<TaskPages>(key, { ...data, pages });
      }

      queryClient.setQueryData<TaskDetail>(
        queryKeys.tasks.detail(projectId, taskId),
        (detail) => (detail ? { ...detail, status } : detail),
      );
      return { columns };
    },
    onError: (_error, _input, context) => {
      for (const { key, data } of context?.columns ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => invalidateProjectTasks(queryClient, projectId),
  });
}

export function useDeleteTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => tasksApi.remove(projectId, taskId),
    meta: { successMessage: "Task deleted" },
    onSuccess: (_data, taskId) => {
      queryClient.removeQueries({
        queryKey: queryKeys.tasks.detail(projectId, taskId),
      });
      return invalidateProjectTasks(queryClient, projectId);
    },
  });
}

export function useDeleteAttachment(projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      tasksApi.removeAttachment(projectId, taskId, attachmentId),
    meta: { successMessage: "Attachment removed" },
    onSuccess: () => invalidateProjectTasks(queryClient, projectId),
  });
}

// ---------- Subtasks ----------

export function useCreateSubtask(projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) =>
      tasksApi.createSubtask(projectId, taskId, title).then((res) => res.data),
    meta: { silent: true },
    onSuccess: () => invalidateProjectTasks(queryClient, projectId),
  });
}

export function useUpdateSubtask(projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  const detailKey = queryKeys.tasks.detail(projectId, taskId);

  return useMutation({
    mutationFn: ({
      subtaskId,
      ...input
    }: SubtaskInput & { subtaskId: string }) =>
      tasksApi
        .updateSubtask(projectId, subtaskId, input)
        .then((res) => res.data),
    // Optimistic so checkboxes respond immediately
    onMutate: async ({ subtaskId, ...input }) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<TaskDetail>(detailKey);
      queryClient.setQueryData<TaskDetail>(detailKey, (task) =>
        task
          ? {
              ...task,
              subtasks: task.subtasks.map((subtask) =>
                subtask._id === subtaskId ? { ...subtask, ...input } : subtask,
              ),
            }
          : task,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey, context.previous);
      }
    },
    onSettled: () => invalidateProjectTasks(queryClient, projectId),
  });
}

export function useDeleteSubtask(projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  const detailKey = queryKeys.tasks.detail(projectId, taskId);

  return useMutation({
    mutationFn: (subtaskId: string) =>
      tasksApi.removeSubtask(projectId, subtaskId),
    onSuccess: (_data, subtaskId) => {
      queryClient.setQueryData<TaskDetail>(detailKey, (task) =>
        task
          ? {
              ...task,
              subtasks: task.subtasks.filter((s) => s._id !== subtaskId),
            }
          : task,
      );
      return invalidateProjectTasks(queryClient, projectId);
    },
  });
}

// ---------- Labels & history ----------

/** Every label used in the project, for autocomplete and filters */
export function useProjectLabels(projectId: string) {
  return useQuery({
    queryKey: queryKeys.tasks.labels(projectId),
    queryFn: () => tasksApi.labels(projectId).then((res) => res.data),
    staleTime: 5 * 60 * 1000,
  });
}

/** A task's history, newest first, 20 entries at a time */
export function useTaskActivity(projectId: string, taskId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.tasks.activity(projectId, taskId),
    queryFn: ({ pageParam }) =>
      tasksApi
        .activity(projectId, taskId, { page: pageParam, limit: 20 })
        .then((res) => res.data),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.hasNextPage ? last.pagination.page + 1 : undefined,
  });
}

// ---------- List view, backlog & my work ----------

/** One page of a project's tasks (list view) */
export function useTaskPage(projectId: string, params: TaskListParams) {
  return useQuery({
    queryKey: queryKeys.tasks.column(projectId, { view: "list", ...params }),
    queryFn: () => tasksApi.list(projectId, params).then((res) => res.data),
    placeholderData: keepPreviousData,
  });
}

/** Tasks in a sprint (or the backlog), loaded 25 at a time */
export function useSprintTasks(projectId: string, sprint: string) {
  const params = {
    sprint,
    sort: "priority",
    order: "desc",
    limit: 25,
  } as const;
  return useInfiniteQuery({
    queryKey: queryKeys.tasks.column(projectId, { view: "backlog", ...params }),
    queryFn: ({ pageParam }) =>
      tasksApi
        .list(projectId, { ...params, page: pageParam })
        .then((res) => res.data),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.hasNextPage ? last.pagination.page + 1 : undefined,
  });
}

/** Tasks assigned to me across all projects */
export function useMyTasks(params: MyTaskParams) {
  return useQuery({
    queryKey: queryKeys.myWork.list(params),
    queryFn: () => tasksApi.mine(params).then((res) => res.data),
    placeholderData: keepPreviousData,
  });
}
