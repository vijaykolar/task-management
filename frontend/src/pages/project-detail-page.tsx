import {
  ArrowLeftIcon,
  CalendarIcon,
  ChartLineIcon,
  MapIcon,
  CheckIcon,
  ClockIcon,
  CrownIcon,
  ListTodoIcon,
  NotebookPenIcon,
  PencilIcon,
  SettingsIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { QueryError } from "@/components/common/query-error";
import { RoleBadge } from "@/components/common/role-badge";
import { UserAvatar } from "@/components/common/user-avatar";
import { MembersPanel } from "@/components/members/members-panel";
import { NotesPanel } from "@/components/notes/notes-panel";
import { ProjectDashboard } from "@/components/dashboard/project-dashboard";
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectSettings } from "@/components/projects/project-settings";
import { ReportsPanel } from "@/components/reports/reports-panel";
import { TasksPanel } from "@/components/tasks/tasks-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AutomationsPanel } from "@/components/automations/automations-panel";
import { RoadmapView } from "@/components/roadmap/roadmap-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProject, useProjectMembers } from "@/features/projects/hooks";
import { useTaskSummary } from "@/features/tasks/hooks";
import { displayName, formatDate, formatRelative } from "@/lib/format";
import { can, roleDescriptions, roleLabels } from "@/lib/permissions";
import { projectColor } from "@/lib/project-color";
import { statusCategoryMeta } from "@/lib/task-status";
import { cn } from "@/lib/utils";
import {
  AvailableStatusCategories,
  AvailableUserRoles,
  UserRoles,
  type UserRole,
} from "@/types/models";

const TABS = [
  "overview",
  "tasks",
  "roadmap",
  "reports",
  "notes",
  "members",
  "settings",
] as const;
type Tab = (typeof TABS)[number];

// What each role may do, per PRD.md §4.2
const capabilityMatrix: { label: string; roles: UserRole[] }[] = [
  { label: "View project, tasks, notes & members", roles: AvailableUserRoles },
  { label: "Edit or delete project", roles: [UserRoles.ADMIN] },
  { label: "Add, invite, remove & re-role members", roles: [UserRoles.ADMIN] },
  {
    label: "Create, update & delete tasks",
    roles: [UserRoles.ADMIN, UserRoles.PROJECT_ADMIN],
  },
  {
    label: "Create, rename & delete subtasks",
    roles: [UserRoles.ADMIN, UserRoles.PROJECT_ADMIN],
  },
  { label: "Mark subtasks complete", roles: AvailableUserRoles },
  { label: "Create, update & delete notes", roles: [UserRoles.ADMIN] },
];

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const project = useProject(projectId);
  const taskSummary = useTaskSummary(projectId);
  // Admins first, for the team preview
  const teamPreview = useProjectMembers(projectId, {
    limit: 5,
    sort: "role",
    order: "asc",
  });

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "overview";
  const setTab = (value: string) =>
    setSearchParams(value === "overview" ? {} : { tab: value }, {
      replace: true,
    });

  if (project.isPending) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (project.isError) {
    const notFound = [400, 403, 404].includes(project.error.statusCode);
    return notFound ? (
      <Empty className="border py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <XIcon />
          </EmptyMedia>
          <EmptyTitle>Project not available</EmptyTitle>
          <EmptyDescription>
            This project doesn&apos;t exist or you&apos;re not a member of it.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeftIcon />
              Back to projects
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    ) : (
      <QueryError
        title="Couldn't load project"
        error={project.error}
        onRetry={() => project.refetch()}
        isRetrying={project.isRefetching}
      />
    );
  }

  const data = project.data;
  const { role } = data;
  const canEdit = can(role, "project:update");
  const canDelete = can(role, "project:delete");

  const summary = taskSummary.data;
  const donePercent = summary?.total
    ? Math.round((summary.done / summary.total) * 100)
    : 0;

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-xl text-2xl font-semibold text-white shadow-sm",
            projectColor(data._id),
          )}
        >
          {data.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight wrap-break-word">
              {data.name}
            </h1>
            <RoleBadge role={role} />
            {data.isOwner && (
              <Badge variant="secondary">
                <CrownIcon data-icon="inline-start" />
                Owner
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {data.description || "No description provided."}
          </p>
        </div>
        {(canEdit || canDelete) && (
          <div className="flex shrink-0 gap-2">
            {canEdit && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <PencilIcon />
                Edit
              </Button>
            )}
            {canDelete && (
              <Button
                variant="destructive"
                size="icon"
                onClick={() => setDeleteOpen(true)}
                aria-label="Delete project"
              >
                <Trash2Icon />
              </Button>
            )}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tasks">
              <ListTodoIcon />
              Tasks
              {summary && (
                <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
                  {summary.total}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="roadmap">
              <MapIcon />
              Roadmap
            </TabsTrigger>
            <TabsTrigger value="reports">
              <ChartLineIcon />
              Reports
            </TabsTrigger>
            <TabsTrigger value="notes">
              <NotebookPenIcon />
              Notes
            </TabsTrigger>
            <TabsTrigger value="members">
              <UsersIcon />
              Members
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
                {data.members}
              </span>
            </TabsTrigger>
            <TabsTrigger value="settings">
              <SettingsIcon />
              Settings
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Overview */}
        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>About this project</CardTitle>
              <CardDescription>Key details at a glance</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              <DetailRow icon={CalendarIcon} label="Created">
                {formatDate(data.createdAt)}
              </DetailRow>
              <DetailRow icon={ClockIcon} label="Last updated">
                {formatRelative(data.updatedAt)}
              </DetailRow>
              <DetailRow icon={UsersIcon} label="Members">
                {data.members}
              </DetailRow>
              <DetailRow icon={SettingsIcon} label="Your role">
                {roleLabels[role]}
                {data.isOwner && " · Owner"}
              </DetailRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Team</CardTitle>
              <CardDescription>
                {data.members === 1 ? "1 member" : `${data.members} members`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {teamPreview.isPending &&
                Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              {teamPreview.data?.items.map((member) => (
                <div key={member.user._id} className="flex items-center gap-3">
                  <UserAvatar user={member.user} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {displayName(member.user)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {roleLabels[member.role]}
                      {member.isOwner && " · Owner"}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setTab("members")}
              >
                View all members
              </Button>
            </CardFooter>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Task progress</CardTitle>
              <CardDescription>
                {!summary
                  ? "Loading tasks…"
                  : summary.total === 0
                    ? "No tasks yet"
                    : `${summary.done} of ${summary.total} tasks done · ${summary.assignedToMeOpen} open ${summary.assignedToMeOpen === 1 ? "task" : "tasks"} assigned to you${summary.overdue ? ` · ${summary.overdue} overdue` : ""}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-3">
                <Progress value={donePercent} className="h-2" />
                <span className="w-10 text-right text-sm font-medium tabular-nums">
                  {donePercent}%
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {/* Grouped by category, so custom workflows still add up */}
                {AvailableStatusCategories.map((category) => {
                  const meta = statusCategoryMeta[category];
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setTab("tasks")}
                      className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <span
                        className={cn(
                          "size-2.5 rounded-full",
                          meta.dotClassName,
                        )}
                      />
                      <span className="flex-1 text-sm text-muted-foreground">
                        {meta.label}
                      </span>
                      {summary ? (
                        <span className="font-heading text-lg font-semibold tabular-nums">
                          {summary[category]}
                        </span>
                      ) : (
                        <Skeleton className="h-5 w-6" />
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <ProjectDashboard
            projectId={projectId}
            className="lg:col-span-3"
            onOpenTask={(taskId) =>
              setSearchParams({ tab: "tasks", task: taskId })
            }
          />

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Role permissions</CardTitle>
              <CardDescription>
                {`Your role: ${roleLabels[role]} — ${roleDescriptions[role]}.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">
                        Capability
                      </th>
                      {AvailableUserRoles.map((r) => (
                        <th
                          key={r}
                          className={cn(
                            "px-4 py-2.5 text-center font-medium",
                            r === role && "bg-primary/5 text-primary",
                          )}
                        >
                          {roleLabels[r]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {capabilityMatrix.map((row) => (
                      <tr key={row.label}>
                        <td className="px-4 py-2.5">{row.label}</td>
                        {AvailableUserRoles.map((r) => (
                          <td
                            key={r}
                            className={cn(
                              "px-4 py-2.5 text-center",
                              r === role && "bg-primary/5",
                            )}
                          >
                            {row.roles.includes(r) ? (
                              <CheckIcon className="mx-auto size-4 text-emerald-600" />
                            ) : (
                              <XIcon className="mx-auto size-4 text-muted-foreground/50" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <TasksPanel projectId={projectId} role={role} />
        </TabsContent>

        <TabsContent value="roadmap">
          <RoadmapView
            projectId={projectId}
            canManage={can(role, "task:manage")}
            onOpenTask={(taskId) =>
              setSearchParams({ tab: "tasks", task: taskId })
            }
          />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsPanel projectId={projectId} />
        </TabsContent>

        <TabsContent value="notes">
          <NotesPanel projectId={projectId} role={role} />
        </TabsContent>

        <TabsContent value="members">
          <MembersPanel projectId={projectId} role={role} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <ProjectSettings
            project={data}
            onEdit={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
          <AutomationsPanel projectId={projectId} role={role} />
        </TabsContent>
      </Tabs>

      {canEdit && (
        <ProjectFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          project={data}
        />
      )}
      {canDelete && (
        <DeleteProjectDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          project={data}
          onDeleted={() => navigate("/", { replace: true })}
        />
      )}
    </>
  );
}
