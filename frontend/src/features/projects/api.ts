import { http } from "@/lib/axios";
import type {
  AddMemberResult,
  ListParams,
  Paginated,
  Project,
  ProjectDetail,
  ProjectInvite,
  ProjectMember,
  ProjectsResponse,
  UserRole,
} from "@/types/models";

export interface ProjectInput {
  name: string;
  description?: string;
}

export interface AddMemberInput {
  email: string;
  role: UserRole;
}

export type ProjectSort = "createdAt" | "name" | "members";
export interface ProjectListParams extends ListParams<ProjectSort> {
  role?: UserRole;
}

export type MemberSort = "joined" | "name" | "role";
export type MemberListParams = ListParams<MemberSort>;

// Endpoints under /api/v1/projects — see backend/src/routes/project.routes.ts
export const projectsApi = {
  list: (params: ProjectListParams = {}) =>
    http.get<ProjectsResponse>("/projects", { params }),

  get: (projectId: string) => http.get<ProjectDetail>(`/projects/${projectId}`),

  create: (body: ProjectInput) => http.post<Project>("/projects", body),

  update: (projectId: string, body: ProjectInput) =>
    http.put<Project>(`/projects/${projectId}`, body),

  remove: (projectId: string) => http.delete<Project>(`/projects/${projectId}`),

  leave: (projectId: string) =>
    http.post<Record<string, never>>(`/projects/${projectId}/leave`),

  transferOwnership: (projectId: string, userId: string) =>
    http.post<Project>(`/projects/${projectId}/transfer-ownership`, { userId }),

  members: (projectId: string, params: MemberListParams = {}) =>
    http.get<Paginated<ProjectMember>>(`/projects/${projectId}/members`, {
      params,
    }),

  addMember: (projectId: string, body: AddMemberInput) =>
    http.post<AddMemberResult>(`/projects/${projectId}/members`, body),

  updateMemberRole: (projectId: string, userId: string, newRole: UserRole) =>
    http.put<ProjectMember>(`/projects/${projectId}/members/${userId}`, {
      newRole,
    }),

  removeMember: (projectId: string, userId: string) =>
    http.delete<ProjectMember>(`/projects/${projectId}/members/${userId}`),

  invites: (projectId: string) =>
    http.get<ProjectInvite[]>(`/projects/${projectId}/invites`),

  resendInvite: (projectId: string, inviteId: string) =>
    http.post<ProjectInvite>(
      `/projects/${projectId}/invites/${inviteId}/resend`,
    ),

  revokeInvite: (projectId: string, inviteId: string) =>
    http.delete<Record<string, never>>(
      `/projects/${projectId}/invites/${inviteId}`,
    ),
};
