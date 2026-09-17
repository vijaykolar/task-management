import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { http } from "@/lib/axios";
import { queryKeys } from "@/lib/query-keys";
import type {
  ProjectDashboard,
  SprintReport,
  TaskType,
  VelocityReport,
} from "@/types/models";

export interface DashboardParams {
  /** 7 to 90 */
  days: number;
  /** One issue type; omit for all work (epics excluded) */
  type?: TaskType;
}

// Endpoints under /api/v1/reports — see backend/src/routes/report.routes.ts
export const reportsApi = {
  sprint: (projectId: string, sprintId: string, timeZone: string) =>
    http.get<SprintReport>(`/reports/${projectId}/sprints/${sprintId}`, {
      params: { tz: timeZone },
    }),
  dashboard: (projectId: string, params: DashboardParams & { tz: string }) =>
    http.get<ProjectDashboard>(`/reports/${projectId}/dashboard`, { params }),
  velocity: (projectId: string, limit: number) =>
    http.get<VelocityReport>(`/reports/${projectId}/velocity`, {
      params: { limit },
    }),
};

/** Days are bucketed in the viewer's time zone */
const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export function useSprintReport(
  projectId: string,
  sprintId: string | undefined,
) {
  const timeZone = browserTimeZone();
  return useQuery({
    queryKey: queryKeys.tasks.sprintReport(projectId, sprintId ?? "", timeZone),
    queryFn: () =>
      reportsApi.sprint(projectId, sprintId!, timeZone).then((res) => res.data),
    enabled: !!sprintId,
    placeholderData: keepPreviousData,
  });
}

export function useVelocity(projectId: string, limit: number) {
  return useQuery({
    queryKey: queryKeys.tasks.velocity(projectId, limit),
    queryFn: () =>
      reportsApi.velocity(projectId, limit).then((res) => res.data),
    placeholderData: keepPreviousData,
  });
}

export function useProjectDashboard(
  projectId: string,
  params: DashboardParams,
) {
  const query = { ...params, tz: browserTimeZone() };
  return useQuery({
    queryKey: queryKeys.tasks.dashboard(projectId, query),
    queryFn: () =>
      reportsApi.dashboard(projectId, query).then((res) => res.data),
    placeholderData: keepPreviousData,
  });
}
