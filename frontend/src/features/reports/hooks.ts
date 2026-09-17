import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { http } from "@/lib/axios";
import { queryKeys } from "@/lib/query-keys";
import type { SprintReport, VelocityReport } from "@/types/models";

// Endpoints under /api/v1/reports — see backend/src/routes/report.routes.ts
export const reportsApi = {
  sprint: (projectId: string, sprintId: string, timeZone: string) =>
    http.get<SprintReport>(`/reports/${projectId}/sprints/${sprintId}`, {
      params: { tz: timeZone },
    }),
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
