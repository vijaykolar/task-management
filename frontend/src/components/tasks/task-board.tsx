import {
  CheckSquareIcon,
  EllipsisIcon,
  MessageSquareIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import { useState, type DragEvent } from "react";

import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DueDateBadge,
  LabelList,
  PriorityIcon,
} from "@/components/tasks/task-fields";
import { useTaskColumn, type TaskFilters } from "@/features/tasks/hooks";
import { displayName, formatRelative } from "@/lib/format";
import { taskStatusMeta } from "@/lib/task-status";
import { cn } from "@/lib/utils";
import {
  AvailableTaskStatuses,
  type TaskListItem,
  type TaskStatus,
} from "@/types/models";

const DRAG_TYPE = "application/x-task";

interface DraggedTask {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface TaskBoardHandlers {
  onOpen: (task: TaskListItem) => void;
  onCreate: (status: TaskStatus) => void;
  onEdit: (task: TaskListItem) => void;
  onDelete: (task: TaskListItem) => void;
  onMove: (
    task: Pick<TaskListItem, "_id" | "title">,
    status: TaskStatus,
  ) => void;
}

interface TaskBoardProps extends TaskBoardHandlers {
  projectId: string;
  filters: TaskFilters;
  canManage: boolean;
}

export function TaskBoard({ projectId, filters, ...props }: TaskBoardProps) {
  const [dragging, setDragging] = useState<DraggedTask | null>(null);

  return (
    <div className="grid items-start gap-4 md:grid-cols-3">
      {AvailableTaskStatuses.map((status) => (
        <TaskColumn
          key={status}
          projectId={projectId}
          status={status}
          filters={filters}
          dragging={dragging}
          setDragging={setDragging}
          {...props}
        />
      ))}
    </div>
  );
}

interface TaskColumnProps extends TaskBoardHandlers {
  projectId: string;
  status: TaskStatus;
  filters: TaskFilters;
  canManage: boolean;
  dragging: DraggedTask | null;
  setDragging: (task: DraggedTask | null) => void;
}

/** One status column; loads its own tasks 20 at a time */
function TaskColumn({
  projectId,
  status,
  filters,
  canManage,
  dragging,
  setDragging,
  onOpen,
  onCreate,
  onEdit,
  onDelete,
  onMove,
}: TaskColumnProps) {
  const meta = taskStatusMeta[status];
  const column = useTaskColumn(projectId, status, filters);
  const [isOver, setIsOver] = useState(false);

  const tasks = column.data?.pages.flatMap((page) => page.items) ?? [];
  const total = column.data?.pages[0]?.pagination.total;
  const canDrop = canManage && dragging !== null && dragging.status !== status;

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsOver(false);
    setDragging(null);
    try {
      const task = JSON.parse(
        event.dataTransfer.getData(DRAG_TYPE),
      ) as DraggedTask;
      if (task.status !== status) {
        onMove({ _id: task.id, title: task.title }, status);
      }
    } catch {
      // Not a task drag
    }
  };

  return (
    <section
      aria-label={meta.label}
      className={cn(
        "flex min-h-40 flex-col rounded-xl border bg-muted/40 p-2 transition-colors",
        isOver && canDrop && "border-primary/50 bg-primary/5",
      )}
      onDragOver={(event) => {
        if (!canDrop) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsOver(false);
        }
      }}
      onDrop={handleDrop}
    >
      <header className="flex items-center gap-2 px-2 py-1.5">
        <span className={cn("size-2 rounded-full", meta.dotClassName)} />
        <h3 className="text-sm font-medium">{meta.label}</h3>
        <span className="rounded-full bg-background px-1.5 text-xs text-muted-foreground tabular-nums">
          {total ?? "–"}
        </span>
        {column.isFetching && !column.isPending && (
          <Spinner className="size-3 text-muted-foreground" />
        )}
        {canManage && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            onClick={() => onCreate(status)}
            aria-label={`Add task to ${meta.label}`}
          >
            <PlusIcon />
          </Button>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-2 p-1">
        {column.isPending &&
          Array.from({ length: status === "todo" ? 3 : 2 }, (_, i) => (
            <div key={i} className="space-y-3 rounded-lg border bg-card p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <div className="flex justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="size-6 rounded-full" />
              </div>
            </div>
          ))}

        {column.isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center text-xs text-destructive">
            {column.error.message}
            <Button
              variant="link"
              size="xs"
              className="block w-full"
              onClick={() => column.refetch()}
            >
              Retry
            </Button>
          </div>
        )}

        {tasks.map((task) => (
          <TaskCard
            key={task._id}
            task={task}
            canManage={canManage}
            isDragging={dragging?.id === task._id}
            onOpen={() => onOpen(task)}
            onEdit={() => onEdit(task)}
            onDelete={() => onDelete(task)}
            onMove={(next) => onMove(task, next)}
            onDragStart={(event) => {
              const payload: DraggedTask = {
                id: task._id,
                title: task.title,
                status: task.status,
              };
              event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
              event.dataTransfer.effectAllowed = "move";
              setDragging(payload);
            }}
            onDragEnd={() => {
              setDragging(null);
              setIsOver(false);
            }}
          />
        ))}

        {column.isSuccess && tasks.length === 0 && (
          <div
            className={cn(
              "flex flex-1 items-center justify-center rounded-lg border border-dashed p-6 text-xs text-muted-foreground",
              isOver && canDrop && "border-primary/50 text-primary",
            )}
          >
            {canDrop ? "Drop here" : "No tasks"}
          </div>
        )}

        {column.hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => column.fetchNextPage()}
            disabled={column.isFetchingNextPage}
          >
            {column.isFetchingNextPage && <Spinner />}
            Load more ({(total ?? 0) - tasks.length} remaining)
          </Button>
        )}
      </div>
    </section>
  );
}

interface TaskCardProps {
  task: TaskListItem;
  canManage: boolean;
  isDragging: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (status: TaskStatus) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
}

function TaskCard({
  task,
  canManage,
  isDragging,
  onOpen,
  onEdit,
  onDelete,
  onMove,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const allSubtasksDone =
    task.subtaskCount > 0 && task.completedSubtaskCount === task.subtaskCount;

  return (
    <article
      draggable={canManage}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group/task relative space-y-2 rounded-lg border bg-card p-3 shadow-xs transition-all hover:border-foreground/20 hover:shadow-sm",
        canManage && "cursor-grab active:cursor-grabbing",
        isDragging && "rotate-1 opacity-50",
      )}
    >
      <div className="flex items-start gap-2">
        <PriorityIcon priority={task.priority} className="mt-0.5" />
        <h4
          className={cn(
            "min-w-0 flex-1 text-sm leading-snug font-medium wrap-break-word",
            task.status === "done" && "text-muted-foreground line-through",
          )}
        >
          {/* Stretched button: the whole card opens the task */}
          <button
            type="button"
            onClick={onOpen}
            className="text-left after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {task.title}
          </button>
        </h4>

        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="relative z-10 -mt-0.5 -mr-1 opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 max-md:opacity-100"
                aria-label={`Actions for ${task.title}`}
              >
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Move to
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={task.status}
                onValueChange={(v) => onMove(v as TaskStatus)}
              >
                {AvailableTaskStatuses.map((status) => (
                  <DropdownMenuRadioItem key={status} value={status}>
                    {taskStatusMeta[status].label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2Icon />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {task.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {task.description}
        </p>
      )}

      {(task.dueDate || task.labels.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          <DueDateBadge
            dueDate={task.dueDate}
            done={task.status === "done"}
            className="h-5"
          />
          <LabelList labels={task.labels} max={3} />
        </div>
      )}

      <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
        {task.subtaskCount > 0 && (
          <span
            className={cn(
              "flex items-center gap-1 tabular-nums",
              allSubtasksDone && "text-emerald-600 dark:text-emerald-400",
            )}
            title="Subtasks completed"
          >
            <CheckSquareIcon className="size-3.5" />
            {task.completedSubtaskCount}/{task.subtaskCount}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="flex items-center gap-1" title="Comments">
            <MessageSquareIcon className="size-3.5" />
            {task.commentCount}
          </span>
        )}
        {task.attachmentCount > 0 && (
          <span className="flex items-center gap-1" title="Attachments">
            <PaperclipIcon className="size-3.5" />
            {task.attachmentCount}
          </span>
        )}
        {!task.subtaskCount && !task.commentCount && !task.attachmentCount && (
          <span title="Last updated">{formatRelative(task.updatedAt)}</span>
        )}

        <span className="ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="relative z-10 flex">
                {task.assignedTo ? (
                  <UserAvatar user={task.assignedTo} size="sm" />
                ) : (
                  <span className="flex size-6 items-center justify-center rounded-full border border-dashed">
                    <UserRoundIcon className="size-3" />
                  </span>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {task.assignedTo ? displayName(task.assignedTo) : "Unassigned"}
            </TooltipContent>
          </Tooltip>
        </span>
      </div>
    </article>
  );
}
