import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { http } from "@/lib/axios";
import { queryKeys } from "@/lib/query-keys";
import type {
  AutomationAction,
  AutomationCondition,
  AutomationRule,
  AutomationRun,
  AutomationTrigger,
} from "@/types/models";

export interface RuleInput {
  name: string;
  enabled?: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

// Endpoints under /api/v1/automations — see backend/src/routes/automation.routes.ts
export const automationsApi = {
  list: (projectId: string) =>
    http.get<AutomationRule[]>(`/automations/${projectId}`),
  create: (projectId: string, body: RuleInput) =>
    http.post<AutomationRule>(`/automations/${projectId}`, body),
  update: (
    projectId: string,
    ruleId: string,
    body: RuleInput | { enabled: boolean },
  ) => http.put<AutomationRule>(`/automations/${projectId}/r/${ruleId}`, body),
  remove: (projectId: string, ruleId: string) =>
    http.delete<Record<string, never>>(`/automations/${projectId}/r/${ruleId}`),
  run: (projectId: string, ruleId: string) =>
    http.post<Record<string, never>>(
      `/automations/${projectId}/r/${ruleId}/run`,
    ),
  runs: (projectId: string, ruleId: string, limit: number) =>
    http.get<AutomationRun[]>(`/automations/${projectId}/runs`, {
      params: { ...(ruleId && { rule: ruleId }), limit },
    }),
};

export function useAutomationRules(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.automations.rules(projectId ?? ""),
    queryFn: () => automationsApi.list(projectId!).then((res) => res.data),
    enabled: !!projectId,
  });
}

/** The run log, for the whole project or one rule */
export function useAutomationRuns(
  projectId: string | undefined,
  ruleId = "",
  limit = 25,
) {
  return useQuery({
    queryKey: [...queryKeys.automations.runs(projectId ?? "", ruleId), limit],
    queryFn: () =>
      automationsApi.runs(projectId!, ruleId, limit).then((res) => res.data),
    enabled: !!projectId,
  });
}

function useInvalidateAutomations(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.automations.project(projectId),
    });
}

export function useSaveRule(projectId: string, ruleId?: string) {
  const invalidate = useInvalidateAutomations(projectId);
  return useMutation({
    mutationFn: (body: RuleInput) =>
      (ruleId
        ? automationsApi.update(projectId, ruleId, body)
        : automationsApi.create(projectId, body)
      ).then((res) => res.data),
    meta: {
      silent: true,
      successMessage: ruleId ? "Rule saved" : "Rule created",
    },
    onSuccess: invalidate,
  });
}

export function useToggleRule(projectId: string) {
  const invalidate = useInvalidateAutomations(projectId);
  return useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      automationsApi
        .update(projectId, ruleId, { enabled })
        .then((res) => res.data),
    meta: { silent: true },
    onSuccess: invalidate,
  });
}

export function useDeleteRule(projectId: string) {
  const invalidate = useInvalidateAutomations(projectId);
  return useMutation({
    mutationFn: (ruleId: string) =>
      automationsApi.remove(projectId, ruleId).then((res) => res.data),
    meta: { silent: true, successMessage: "Rule deleted" },
    onSuccess: invalidate,
  });
}

/** Runs a scheduled rule now, so you can see what it does */
export function useRunRule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      automationsApi.run(projectId, ruleId).then((res) => res.data),
    meta: { silent: true, successMessage: "Rule ran" },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.automations.project(projectId),
        }),
        // It may well have created or changed tasks
        queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.project(projectId),
        }),
      ]),
  });
}
