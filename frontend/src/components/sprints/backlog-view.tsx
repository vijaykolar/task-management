import {
  CalendarRangeIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  EllipsisIcon,
  InboxIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  UserRoundIcon,
  ZapIcon,
} from "lucide-react";
import { useState, type DragEvent } from "react";

import { UserAvatar } from "@/components/common/user-avatar";
import {
  CompleteSprintDialog,
  SprintFormDialog,
} from "@/components/sprints/sprint-dialogs";
import {
  DueDateBadge,
  LabelList,
  PriorityIcon,
} from "@/components/tasks/task-fields";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  useDeleteSprint,
  useSprints,
  useStartSprint,
} from "@/features/sprints/hooks";
import { useSprintTasks, useUpdateTask } from "@/features/tasks/hooks";
import { formatDueDate } from "@/lib/due-date";
import { displayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Sprint, TaskListItem } from "@/types/models";

const DRAG_TYPE = "application/x-backlog-task";
const BACKLOG = "backlog";

interface BacklogViewProps {
  projectId: string;
  canManage: boolean;
  onOpenTask: (taskId: string) => void;
  onCreateTask: () => void;
}

/** Jira-style planning: sprint sections above the backlog, drag tasks between them */
export function BacklogView({
  projectId,
  canManage,
  onOpenTask,
  onCreateTask,
}: BacklogViewProps) {
  const sprints = useSprints(projectId);
  const updateTask = useUpdateTask(projectId);
  const startSprint = useStartSprint(projectId);
  const deleteSprint = useDeleteSprint(projectId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [completing, setCompleting] = useState<Sprint | null>(null);
  const [deleting, setDeleting] = useState<Sprint | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const all = sprints.data?.sprints ?? [];
  const current = all.filter((sprint) => sprint.status !== "completed");
  const completed = all.filter((sprint) => sprint.status === "completed");
  const planned = all.filter((sprint) => sprint.status === "planned");
  const hasActive = all.some((sprint) => sprint.status === "active");

  /** "" = backlog */
  const moveTask = (taskId: string, sprintId: string) =>
    updateTask.mutate({ taskId, sprint: sprintId });

  if (sprints.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  const sectionProps = {
    projectId,
    canManage,
    onOpenTask,
    onMoveTask: moveTask,
    moveTargets: current,
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <ZapIcon />
            Create sprint
          </Button>
          <Button onClick={onCreateTask}>
            <PlusIcon />
            New task
          </Button>
        </div>
      )}

      {current.map((sprint) => (
        <TaskSection
          key={sprint._id}
          {...sectionProps}
          sprint={sprint}
          header={
            <SprintHeader
              sprint={sprint}
              canManage={canManage}
              canStart={!hasActive}
              isStarting={
                startSprint.isPending &&
                startSprint.variables?.sprintId === sprint._id
              }
              onStart={() => startSprint.mutate({ sprintId: sprint._id })}
              onComplete={() => setCompleting(sprint)}
              onEdit={() => setEditing(sprint)}
              onDelete={() => setDeleting(sprint)}
            />
          }
        />
      ))}

      <TaskSection
        {...sectionProps}
        sprint={null}
        header={
          <div className="flex items-center gap-2">
            <InboxIcon className="size-4 text-muted-foreground" />
            <h3 className="font-medium">Backlog</h3>
            <span className="text-sm text-muted-foreground">
              {sprints.data?.backlog.taskCount ?? 0} tasks
            </span>
          </div>
        }
      />

      {completed.length > 0 && (
        <div className="space-y-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setShowCompleted((v) => !v)}
          >
            <ChevronDownIcon
              className={cn(
                "transition-transform",
                !showCompleted && "-rotate-90",
              )}
            />
            Completed sprints ({completed.length})
          </Button>
          {showCompleted &&
            completed.map((sprint) => (
              <TaskSection
                key={sprint._id}
                {...sectionProps}
                sprint={sprint}
                canManage={false}
                header={
                  <SprintHeader
                    sprint={sprint}
                    canManage={canManage}
                    canStart={false}
                    onEdit={() => setEditing(sprint)}
                    onDelete={() => setDeleting(sprint)}
                  />
                }
              />
            ))}
        </div>
      )}

      {canManage && (
        <>
          <SprintFormDialog
            projectId={projectId}
            open={createOpen}
            onOpenChange={setCreateOpen}
          />
          <SprintFormDialog
            projectId={projectId}
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
            sprint={editing ?? undefined}
          />
          <CompleteSprintDialog
            key={completing?._id}
            projectId={projectId}
            sprint={completing}
            plannedSprints={planned}
            onOpenChange={(open) => !open && setCompleting(null)}
          />
        </>
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {deleting?.taskCount ?? 0} tasks move back to the backlog. The
              tasks themselves are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSprint.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteSprint.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!deleting) return;
                deleteSprint.mutate(deleting._id, {
                  onSuccess: () => setDeleting(null),
                });
              }}
            >
              {deleteSprint.isPending && <Spinner />}
              Delete sprint
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SprintHeader({
  sprint,
  canManage,
  canStart,
  isStarting,
  onStart,
  onComplete,
  onEdit,
  onDelete,
}: {
  sprint: Sprint;
  canManage: boolean;
  canStart: boolean;
  isStarting?: boolean;
  onStart?: () => void;
  onComplete?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const percent = sprint.taskCount
    ? Math.round((sprint.doneCount / sprint.taskCount) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <ZapIcon
            className={cn(
              "size-4",
              sprint.status === "active"
                ? "text-emerald-500"
                : "text-muted-foreground",
            )}
          />
          <h3 className="font-medium">{sprint.name}</h3>
          <Badge
            variant="outline"
            className={cn(
              sprint.status === "active" &&
                "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
            )}
          >
            {sprint.status === "active"
              ? "Active"
              : sprint.status === "completed"
                ? "Completed"
                : "Planned"}
          </Badge>
          {(sprint.startDate || sprint.endDate) && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarRangeIcon className="size-3.5" />
              {formatDueDate(sprint.startDate)} –{" "}
              {formatDueDate(sprint.endDate)}
            </span>
          )}
        </div>
        {sprint.goal && (
          <p className="text-sm text-muted-foreground">{sprint.goal}</p>
        )}
        {sprint.taskCount > 0 && (
          <div className="flex max-w-xs items-center gap-2">
            <Progress value={percent} className="h-1.5" />
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {sprint.doneCount}/{sprint.taskCount} done
            </span>
          </div>
        )}
      </div>

      {canManage && (
        <div className="flex shrink-0 items-center gap-1">
          {sprint.status === "planned" && (
            <Button
              size="sm"
              variant="outline"
              onClick={onStart}
              disabled={!canStart || isStarting}
              title={canStart ? undefined : "Complete the active sprint first"}
            >
              {isStarting ? <Spinner /> : <PlayIcon />}
              Start sprint
            </Button>
          )}
          {sprint.status === "active" && (
            <Button size="sm" onClick={onComplete}>
              <CheckCircle2Icon />
              Complete sprint
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${sprint.name} actions`}
              >
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon />
                Edit sprint
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2Icon />
                Delete sprint
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

interface TaskSectionProps {
  projectId: string;
  sprint: Sprint | null;
  header: React.ReactNode;
  canManage: boolean;
  moveTargets: Sprint[];
  onOpenTask: (taskId: string) => void;
  onMoveTask: (taskId: string, sprintId: string) => void;
}

/** A sprint (or the backlog) and its tasks; a drop target for dragged tasks */
function TaskSection({
  projectId,
  sprint,
  header,
  canManage,
  moveTargets,
  onOpenTask,
  onMoveTask,
}: TaskSectionProps) {
  const sectionId = sprint?._id ?? "";
  const tasks = useSprintTasks(projectId, sprint?._id ?? BACKLOG);
  const [isOver, setIsOver] = useState(false);
  const items = tasks.data?.pages.flatMap((page) => page.items) ?? [];
  const total = tasks.data?.pages[0]?.pagination.total ?? 0;
  const acceptsDrops = canManage && sprint?.status !== "completed";

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsOver(false);
    const payload = event.dataTransfer.getData(DRAG_TYPE);
    if (!payload) return;
    const { taskId, from } = JSON.parse(payload) as {
      taskId: string;
      from: string;
    };
    if (from !== sectionId) onMoveTask(taskId, sectionId);
  };

  return (
    <section
      className={cn(
        "rounded-xl border bg-card transition-colors",
        isOver && "border-primary/50 bg-primary/5",
      )}
      onDragOver={(event) => {
        if (!acceptsDrops || !event.dataTransfer.types.includes(DRAG_TYPE))
          return;
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setIsOver(false);
      }}
      onDrop={acceptsDrops ? handleDrop : undefined}
    >
      <div className="border-b px-4 py-3">{header}</div>

      <ul className="divide-y">
        {tasks.isPending &&
          Array.from({ length: 2 }, (_, i) => (
            <li key={i} className="px-4 py-3">
              <Skeleton className="h-5 w-2/3" />
            </li>
          ))}

        {tasks.isSuccess && items.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            {sprint
              ? canManage
                ? "Drag tasks here from the backlog to plan this sprint"
                : "No tasks in this sprint"
              : "The backlog is empty"}
          </li>
        )}

        {items.map((task) => (
          <BacklogRow
            key={task._id}
            task={task}
            sectionId={sectionId}
            canManage={canManage}
            moveTargets={moveTargets}
            onOpen={() => onOpenTask(task._id)}
            onMove={(sprintId) => onMoveTask(task._id, sprintId)}
          />
        ))}
      </ul>

      {tasks.hasNextPage && (
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => tasks.fetchNextPage()}
            disabled={tasks.isFetchingNextPage}
          >
            {tasks.isFetchingNextPage && <Spinner />}
            Load more ({total - items.length} remaining)
          </Button>
        </div>
      )}
    </section>
  );
}

function BacklogRow({
  task,
  sectionId,
  canManage,
  moveTargets,
  onOpen,
  onMove,
}: {
  task: TaskListItem;
  sectionId: string;
  canManage: boolean;
  moveTargets: Sprint[];
  onOpen: () => void;
  onMove: (sprintId: string) => void;
}) {
  return (
    <li
      draggable={canManage}
      onDragStart={(event) => {
        event.dataTransfer.setData(
          DRAG_TYPE,
          JSON.stringify({ taskId: task._id, from: sectionId }),
        );
        event.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "group/row relative flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40",
        canManage && "cursor-grab active:cursor-grabbing",
      )}
    >
      <PriorityIcon priority={task.priority} />
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "min-w-0 flex-1 truncate text-left font-medium after:absolute after:inset-0 focus-visible:outline-none",
          task.status === "done" && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </button>
      <LabelList labels={task.labels} max={2} className="hidden md:flex" />
      <DueDateBadge
        dueDate={task.dueDate}
        done={task.status === "done"}
        className="hidden h-5 sm:inline-flex"
      />
      <TaskStatusBadge status={task.status} className="hidden sm:inline-flex" />
      {task.assignedTo ? (
        <UserAvatar user={task.assignedTo} size="sm" />
      ) : (
        <span
          className="flex size-6 items-center justify-center rounded-full border border-dashed text-muted-foreground"
          title="Unassigned"
        >
          <UserRoundIcon className="size-3" />
        </span>
      )}
      {task.assignedTo && (
        <span className="sr-only">{displayName(task.assignedTo)}</span>
      )}

      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="relative z-10 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 max-md:opacity-100"
              aria-label={`Move ${task.title}`}
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Move to
            </DropdownMenuLabel>
            {sectionId !== "" && (
              <DropdownMenuItem onSelect={() => onMove("")}>
                <InboxIcon />
                Backlog
              </DropdownMenuItem>
            )}
            {moveTargets
              .filter((sprint) => sprint._id !== sectionId)
              .map((sprint) => (
                <DropdownMenuItem
                  key={sprint._id}
                  onSelect={() => onMove(sprint._id)}
                >
                  <ZapIcon />
                  {sprint.name}
                </DropdownMenuItem>
              ))}
            {moveTargets.length === 0 && sectionId === "" && (
              <>
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  Create a sprint first
                </p>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
