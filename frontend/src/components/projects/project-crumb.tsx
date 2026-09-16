import { useProject } from "@/features/projects/hooks";

/** Breadcrumb label that resolves a project id to its name */
export function ProjectCrumb({ projectId }: { projectId: string }) {
  const { data } = useProject(projectId);
  return <>{data?.name ?? "Project"}</>;
}
