import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { useMemo } from "react";

import {
  projectsApi,
  type AddMemberInput,
  type MemberListParams,
  type ProjectInput,
  type ProjectListParams,
  type WorkflowInput,
} from "@/features/projects/api";
import { queryKeys } from "@/lib/query-keys";
import { describeStatus } from "@/lib/task-status";
import type {
  Paginated,
  ProjectDetail,
  ProjectMember,
  UserRole,
} from "@/types/models";

/** Drops every cached query that belongs to a project the user lost access to */
function forgetProject(queryClient: QueryClient, projectId: string) {
  for (const queryKey of [
    queryKeys.projects.detail(projectId),
    queryKeys.projects.members(projectId),
    queryKeys.projects.invites(projectId),
    queryKeys.tasks.project(projectId),
    queryKeys.notes.project(projectId),
  ]) {
    queryClient.removeQueries({ queryKey });
  }
  return queryClient.invalidateQueries({
    queryKey: queryKeys.projects.lists(),
  });
}

// ---------- Projects ----------

/** One page of the user's projects; keeps the previous page visible while loading */
export function useProjects(params: ProjectListParams = {}) {
  return useQuery({
    queryKey: queryKeys.projects.list(params),
    queryFn: () => projectsApi.list(params).then((res) => res.data),
    placeholderData: keepPreviousData,
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projects.detail(projectId ?? ""),
    queryFn: () => projectsApi.get(projectId!).then((res) => res.data),
    enabled: !!projectId,
  });
}

/**
 * A project's workflow: `statuses` are the board columns in order, `all`
 * includes archived ones (for history), `describe` names any status key.
 */
export function useProjectWorkflow(projectId: string | undefined) {
  const { data, isPending } = useProject(projectId);
  return useMemo(() => {
    const all = data?.statuses ?? [];
    return {
      isPending,
      all,
      statuses: all.filter((status) => !status.archived),
      describe: (key: string) => describeStatus(all, key),
    };
  }, [data?.statuses, isPending]);
}

export function useUpdateWorkflow(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: WorkflowInput) =>
      projectsApi.updateWorkflow(projectId, body).then((res) => res.data),
    meta: { silent: true, successMessage: "Workflow saved" },
    onSuccess: (statuses) => {
      queryClient.setQueryData<ProjectDetail>(
        queryKeys.projects.detail(projectId),
        (current) => (current ? { ...current, statuses } : current),
      );
      // Tasks may have moved out of removed statuses
      return queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.project(projectId),
      });
    },
  });
}

/** The current user's role and ownership in a project */
export function useProjectRole(projectId: string | undefined) {
  const { data, isLoading } = useProject(projectId);
  return { role: data?.role, isOwner: data?.isOwner ?? false, isLoading };
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectInput) =>
      projectsApi.create(body).then((res) => res.data),
    meta: { silent: true, successMessage: "Project created" },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() }),
  });
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectInput) =>
      projectsApi.update(projectId, body).then((res) => res.data),
    meta: { silent: true, successMessage: "Project updated" },
    onSuccess: (project) => {
      // The update response lacks role/members, so merge into the cached detail
      queryClient.setQueryData<ProjectDetail>(
        queryKeys.projects.detail(projectId),
        (current) => (current ? { ...current, ...project } : current),
      );
      return queryClient.invalidateQueries({
        queryKey: queryKeys.projects.lists(),
      });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      projectsApi.remove(projectId).then((res) => res.data),
    meta: { successMessage: "Project deleted" },
    onSuccess: (_data, projectId) => forgetProject(queryClient, projectId),
  });
}

export function useLeaveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => projectsApi.leave(projectId),
    onSuccess: (_data, projectId) => forgetProject(queryClient, projectId),
  });
}

export function useTransferOwnership(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      projectsApi.transferOwnership(projectId, userId),
    meta: { successMessage: "Ownership transferred" },
    onSuccess: () =>
      Promise.all(
        [
          queryKeys.projects.detail(projectId),
          queryKeys.projects.members(projectId),
          queryKeys.projects.lists(),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });
}

// ---------- Members ----------

export function useProjectMembers(
  projectId: string | undefined,
  params: MemberListParams = {},
) {
  return useQuery({
    queryKey: queryKeys.projects.memberPage(projectId ?? "", params),
    queryFn: () =>
      projectsApi.members(projectId!, params).then((res) => res.data),
    enabled: !!projectId,
    placeholderData: keepPreviousData,
  });
}

/** Up to 100 members sorted by name, for pickers (assignee, new owner) */
export function useMemberOptions(projectId: string | undefined) {
  return useProjectMembers(projectId, {
    limit: 100,
    sort: "name",
    order: "asc",
  });
}

function useInvalidateMembers(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [
        queryKeys.projects.members(projectId),
        queryKeys.projects.invites(projectId),
        queryKeys.projects.detail(projectId),
        // Member counts are shown in the project list
        queryKeys.projects.lists(),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

export function useAddMember(projectId: string) {
  const invalidate = useInvalidateMembers(projectId);
  return useMutation({
    mutationFn: (body: AddMemberInput) =>
      projectsApi.addMember(projectId, body).then((res) => res.data),
    meta: { silent: true },
    onSuccess: invalidate,
  });
}

export function useUpdateMemberRole(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateMembers(projectId);
  const root = queryKeys.projects.members(projectId);

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) =>
      projectsApi.updateMemberRole(projectId, userId, role),
    meta: { successMessage: "Role updated" },
    // Optimistic update on every cached members page
    onMutate: async ({ userId, role }) => {
      await queryClient.cancelQueries({ queryKey: root });
      const previous = queryClient.getQueriesData<Paginated<ProjectMember>>({
        queryKey: root,
      });
      queryClient.setQueriesData<Paginated<ProjectMember>>(
        { queryKey: root },
        (page) =>
          page && {
            ...page,
            items: page.items.map((m) =>
              m.user._id === userId ? { ...m, role } : m,
            ),
          },
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: invalidate,
  });
}

export function useRemoveMember(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateMembers(projectId);
  return useMutation({
    mutationFn: (userId: string) => projectsApi.removeMember(projectId, userId),
    meta: { successMessage: "Member removed" },
    onSuccess: () =>
      Promise.all([
        invalidate(),
        // The backend unassigns the removed member's tasks
        queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.project(projectId),
        }),
      ]),
  });
}

// ---------- Invitations ----------

export function useProjectInvites(projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.projects.invites(projectId),
    queryFn: () => projectsApi.invites(projectId).then((res) => res.data),
    enabled,
  });
}

export function useResendInvite(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      projectsApi.resendInvite(projectId, inviteId),
    meta: { successMessage: "Invitation re-sent" },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.invites(projectId),
      }),
  });
}

export function useRevokeInvite(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      projectsApi.revokeInvite(projectId, inviteId),
    meta: { successMessage: "Invitation revoked" },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.invites(projectId),
      }),
  });
}
