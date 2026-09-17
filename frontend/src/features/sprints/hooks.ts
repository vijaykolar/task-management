import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/lib/axios";
import { queryKeys } from "@/lib/query-keys";
import type { Sprint, SprintsResponse } from "@/types/models";

export interface SprintInput {
  name?: string;
  goal?: string;
  /** `YYYY-MM-DD`, "" to clear */
  startDate?: string;
  endDate?: string;
}

// Endpoints under /api/v1/sprints — see backend/src/routes/sprint.routes.ts
export const sprintsApi = {
  list: (projectId: string) =>
    http.get<SprintsResponse>(`/sprints/${projectId}`),
  create: (projectId: string, body: SprintInput) =>
    http.post<Sprint>(`/sprints/${projectId}`, body),
  update: (projectId: string, sprintId: string, body: SprintInput) =>
    http.put<Sprint>(`/sprints/${projectId}/s/${sprintId}`, body),
  remove: (projectId: string, sprintId: string) =>
    http.delete<{ movedToBacklog: number }>(
      `/sprints/${projectId}/s/${sprintId}`,
    ),
  start: (projectId: string, sprintId: string, body: SprintInput = {}) =>
    http.post<Sprint>(`/sprints/${projectId}/s/${sprintId}/start`, body),
  /** Corrects the report of a sprint from before reports existed */
  correctReport: (
    projectId: string,
    sprintId: string,
    body: {
      committed: { task: string }[];
      atEnd?: { task: string; done: boolean }[];
    },
  ) =>
    http.put<{ _id: string }>(
      `/sprints/${projectId}/s/${sprintId}/report`,
      body,
    ),

  complete: (projectId: string, sprintId: string, moveOpenTo: string) =>
    http.post<{ doneCount: number; movedCount: number }>(
      `/sprints/${projectId}/s/${sprintId}/complete`,
      { moveOpenTo },
    ),
};

export function useSprints(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sprints.project(projectId ?? ""),
    queryFn: () => sprintsApi.list(projectId!).then((res) => res.data),
    enabled: !!projectId,
  });
}

/** Sprint changes also move tasks, so refresh both */
function useInvalidatePlanning(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.sprints.project(projectId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.project(projectId),
      }),
    ]);
}

export function useCreateSprint(projectId: string) {
  const invalidate = useInvalidatePlanning(projectId);
  return useMutation({
    mutationFn: (body: SprintInput) =>
      sprintsApi.create(projectId, body).then((res) => res.data),
    meta: { silent: true, successMessage: "Sprint created" },
    onSuccess: invalidate,
  });
}

export function useUpdateSprint(projectId: string) {
  const invalidate = useInvalidatePlanning(projectId);
  return useMutation({
    mutationFn: ({ sprintId, ...body }: SprintInput & { sprintId: string }) =>
      sprintsApi.update(projectId, sprintId, body).then((res) => res.data),
    meta: { silent: true, successMessage: "Sprint updated" },
    onSuccess: invalidate,
  });
}

export function useDeleteSprint(projectId: string) {
  const invalidate = useInvalidatePlanning(projectId);
  return useMutation({
    mutationFn: (sprintId: string) =>
      sprintsApi.remove(projectId, sprintId).then((res) => res.data),
    meta: { successMessage: "Sprint deleted — its tasks moved to the backlog" },
    onSuccess: invalidate,
  });
}

export function useStartSprint(projectId: string) {
  const invalidate = useInvalidatePlanning(projectId);
  return useMutation({
    mutationFn: ({ sprintId, ...body }: SprintInput & { sprintId: string }) =>
      sprintsApi.start(projectId, sprintId, body).then((res) => res.data),
    meta: { successMessage: "Sprint started" },
    onSuccess: invalidate,
  });
}

export function useCompleteSprint(projectId: string) {
  const invalidate = useInvalidatePlanning(projectId);
  return useMutation({
    mutationFn: ({
      sprintId,
      moveOpenTo,
    }: {
      sprintId: string;
      moveOpenTo: string;
    }) =>
      sprintsApi
        .complete(projectId, sprintId, moveOpenTo)
        .then((res) => res.data),
    onSuccess: invalidate,
  });
}

export function useCorrectSprintReport(projectId: string, sprintId: string) {
  const invalidate = useInvalidatePlanning(projectId);
  return useMutation({
    mutationFn: (body: Parameters<typeof sprintsApi.correctReport>[2]) =>
      sprintsApi
        .correctReport(projectId, sprintId, body)
        .then((res) => res.data),
    meta: { successMessage: "Sprint report confirmed" },
    // Reports live under the project's task queries, refreshed here too
    onSuccess: invalidate,
  });
}
