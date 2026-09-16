import {
  ArrowDownIcon,
  ArrowUpIcon,
  InboxIcon,
  KanbanIcon,
  ListIcon,
  ListTodoIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { BacklogView } from "@/components/sprints/backlog-view";
import { SprintFilterSelect } from "@/components/sprints/sprint-select";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskListView } from "@/components/tasks/task-list-view";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSprints } from "@/features/sprints/hooks";
import {
  TaskFilters as TaskFieldFiltersPopover,
  type TaskFieldFilters,
} from "@/components/tasks/task-filters";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import {
  TaskFormDialog,
  type EditableTask,
} from "@/components/tasks/task-form-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { TaskSort } from "@/features/tasks/api";
import {
  useDeleteTask,
  useTaskSummary,
  useUpdateTask,
  type TaskFilters,
} from "@/features/tasks/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { can } from "@/lib/permissions";
import { taskStatusMeta } from "@/lib/task-status";
import {
  TaskStatuses,
  type SortOrder,
  type TaskStatus,
  type UserRole,
} from "@/types/models";

type AssigneeFilter = "all" | "me" | "unassigned";

const VIEWS = ["board", "list", "backlog"] as const;
type TaskView = (typeof VIEWS)[number];

const sortLabels: Record<TaskSort, string> = {
  createdAt: "Date created",
  updatedAt: "Last updated",
  dueDate: "Due date",
  priority: "Priority",
  title: "Title",
};

interface TasksPanelProps {
  projectId: string;
  role: UserRole | undefined;
}

export function TasksPanel({ projectId, role }: TasksPanelProps) {
  const summary = useTaskSummary(projectId);
  const updateTask = useUpdateTask(projectId);
  const deleteTask = useDeleteTask(projectId);
  const canManage = can(role, "task:manage");

  const [searchParams, setSearchParams] = useSearchParams();
  const openTaskId = searchParams.get("task");
  const viewParam = searchParams.get("view") as TaskView | null;
  const view: TaskView =
    viewParam && VIEWS.includes(viewParam) ? viewParam : "board";
  const setView = (next: string) =>
    setSearchParams(
      (params) => {
        if (next === "board") params.delete("view");
        else params.set("view", next);
        return params;
      },
      { replace: true },
    );

  // Default the board/list to the active sprint when there is one
  const sprints = useSprints(projectId);
  const hasActiveSprint = !!sprints.data?.sprints.some(
    (sprint) => sprint.status === "active",
  );
  const [sprintChoice, setSprintChoice] = useState<string | null>(null);
  const sprintFilter = sprintChoice ?? (hasActiveSprint ? "active" : "all");
  // New tasks land in the sprint being viewed, so they stay visible
  const activeSprintId = sprints.data?.sprints.find(
    (sprint) => sprint.status === "active",
  )?._id;
  const defaultSprint =
    sprintFilter === "active"
      ? activeSprintId
      : sprintFilter === "all" || sprintFilter === "backlog"
        ? ""
        : sprintFilter;

  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState<AssigneeFilter>("all");
  const [sort, setSort] = useState<TaskSort>("createdAt");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [fieldFilters, setFieldFilters] = useState<TaskFieldFilters>({});
  const debouncedSearch = useDebouncedValue(search.trim());

  const filters: TaskFilters = {
    sort,
    order,
    search: debouncedSearch || undefined,
    assignee: assignee === "all" ? undefined : assignee,
    sprint: sprintFilter === "all" ? undefined : sprintFilter,
    ...fieldFilters,
  };

  const [createStatus, setCreateStatus] = useState<TaskStatus | null>(null);
  const [editing, setEditing] = useState<EditableTask | null>(null);
  const [deleting, setDeleting] = useState<{
    _id: string;
    title: string;
  } | null>(null);

  // Keep the open task in the URL so it can be shared / survives refresh
  const setOpenTask = (taskId: string | null) =>
    setSearchParams(
      (params) => {
        if (taskId) params.set("task", taskId);
        else params.delete("task");
        return params;
      },
      { replace: !taskId },
    );

  const hasNoTasks = summary.data?.total === 0;

  return (
    <div className="space-y-4">
      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="board">
            <KanbanIcon />
            Board
          </TabsTrigger>
          <TabsTrigger value="list">
            <ListIcon />
            List
          </TabsTrigger>
          <TabsTrigger value="backlog">
            <InboxIcon />
            Backlog
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {view !== "backlog" && (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <InputGroup className="lg:max-w-xs">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search tasks"
            />
          </InputGroup>
          <div className="flex flex-wrap gap-2">
            <Select
              value={assignee}
              onValueChange={(v) => setAssignee(v as AssigneeFilter)}
            >
              <SelectTrigger
                className="flex-1 sm:w-44"
                aria-label="Filter by assignee"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone&apos;s tasks</SelectItem>
                <SelectItem value="me">Assigned to me</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
            <SprintFilterSelect
              projectId={projectId}
              value={sprintFilter}
              onValueChange={setSprintChoice}
            />
            <TaskFieldFiltersPopover
              projectId={projectId}
              value={fieldFilters}
              onChange={setFieldFilters}
            />
            <Select value={sort} onValueChange={(v) => setSort(v as TaskSort)}>
              <SelectTrigger className="flex-1 sm:w-40" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(sortLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
              aria-label={
                order === "asc" ? "Sort descending" : "Sort ascending"
              }
            >
              {order === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
            </Button>
          </div>
          {canManage && (
            <Button
              className="lg:ml-auto"
              onClick={() => setCreateStatus(TaskStatuses.TODO)}
            >
              <PlusIcon />
              New task
            </Button>
          )}
        </div>
      )}

      {view === "backlog" ? (
        <BacklogView
          projectId={projectId}
          canManage={canManage}
          onOpenTask={setOpenTask}
          onCreateTask={() => setCreateStatus(TaskStatuses.TODO)}
        />
      ) : hasNoTasks ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListTodoIcon />
            </EmptyMedia>
            <EmptyTitle>No tasks yet</EmptyTitle>
            <EmptyDescription>
              {canManage
                ? "Break the project into tasks, assign them and track progress on the board."
                : "Tasks created by project admins will show up here."}
            </EmptyDescription>
          </EmptyHeader>
          {canManage && (
            <EmptyContent>
              <Button onClick={() => setCreateStatus(TaskStatuses.TODO)}>
                <PlusIcon />
                Create first task
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : view === "list" ? (
        <TaskListView
          // New filters start again from page 1
          key={JSON.stringify(filters)}
          projectId={projectId}
          filters={filters}
          onOpenTask={setOpenTask}
        />
      ) : (
        <TaskBoard
          projectId={projectId}
          filters={filters}
          canManage={canManage}
          onOpen={(task) => setOpenTask(task._id)}
          onCreate={setCreateStatus}
          onEdit={setEditing}
          onDelete={setDeleting}
          onMove={(task, status) =>
            updateTask.mutate(
              { taskId: task._id, status },
              {
                onSuccess: () =>
                  toast.success(`Moved to ${taskStatusMeta[status].label}`, {
                    description: task.title,
                  }),
              },
            )
          }
        />
      )}

      <TaskDetailSheet
        projectId={projectId}
        taskId={openTaskId}
        role={role}
        onClose={() => setOpenTask(null)}
        onEdit={(task) =>
          setEditing({ ...task, attachmentCount: task.attachments.length })
        }
        onDelete={setDeleting}
      />

      {canManage && (
        <>
          <TaskFormDialog
            projectId={projectId}
            open={createStatus !== null}
            defaultSprint={view === "backlog" ? "" : defaultSprint}
            onOpenChange={(open) => !open && setCreateStatus(null)}
            defaultStatus={createStatus ?? undefined}
            onCreated={setOpenTask}
          />
          <TaskFormDialog
            projectId={projectId}
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
            task={editing ?? undefined}
          />
        </>
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” and all of its subtasks and attachments will
              be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTask.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteTask.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!deleting) return;
                deleteTask.mutate(deleting._id, {
                  onSuccess: () => {
                    if (openTaskId === deleting._id) setOpenTask(null);
                    setDeleting(null);
                  },
                });
              }}
            >
              {deleteTask.isPending && <Spinner />}
              Delete task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
