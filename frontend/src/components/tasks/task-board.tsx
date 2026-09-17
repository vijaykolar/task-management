import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  BanIcon,
  CheckSquareIcon,
  EllipsisIcon,
  MessageSquareIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import { useState } from "react";

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
  PointsBadge,
  PriorityIcon,
} from "@/components/tasks/task-fields";
import { EpicChip, TaskKey, TaskTypeIcon } from "@/components/tasks/task-type";
import { useProjectWorkflow } from "@/features/projects/hooks";
import { useTaskColumn, type TaskFilters } from "@/features/tasks/hooks";
import { displayName, formatRelative } from "@/lib/format";
import { statusCategoryMeta } from "@/lib/task-status";
import { cn } from "@/lib/utils";
import type { ProjectStatus, TaskListItem, TaskStatus } from "@/types/models";

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

/** One column per workflow status; drag cards between columns to move them */
export function TaskBoard({ projectId, filters, ...props }: TaskBoardProps) {
  const workflow = useProjectWorkflow(projectId);
  const [dragged, setDragged] = useState<TaskListItem | null>(null);

  // A small movement threshold keeps clicks on cards working
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    const task = active.data.current?.task as TaskListItem | undefined;
    const status = over?.id as TaskStatus | undefined;
    if (task && status && status !== task.status) props.onMove(task, status);
  };

  if (workflow.isPending) {
    return (
      <div className="flex gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-64 min-w-72 flex-1 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) =>
        setDragged((active.data.current?.task as TaskListItem) ?? null)
      }
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragged(null)}
    >
      {/* Wide workflows scroll sideways instead of squeezing columns */}
      <div className="-mx-1 flex items-start gap-4 overflow-x-auto px-1 pb-2">
        {workflow.statuses.map((status) => (
          <TaskColumn
            key={status.key}
            projectId={projectId}
            status={status}
            filters={filters}
            dragged={dragged}
            {...props}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragged && (
          <TaskCard
            task={dragged}
            canManage={false}
            statuses={workflow.statuses}
            className="rotate-2 cursor-grabbing shadow-lg"
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface TaskColumnProps extends TaskBoardHandlers {
  projectId: string;
  status: ProjectStatus;
  filters: TaskFilters;
  canManage: boolean;
  dragged: TaskListItem | null;
}

/** One status column; loads its own tasks 20 at a time */
function TaskColumn({
  projectId,
  status,
  filters,
  canManage,
  dragged,
  onOpen,
  onCreate,
  onEdit,
  onDelete,
  onMove,
}: TaskColumnProps) {
  const workflow = useProjectWorkflow(projectId);
  const meta = statusCategoryMeta[status.category];
  const column = useTaskColumn(projectId, status.key, filters);
  const canDrop = canManage && !!dragged && dragged.status !== status.key;
  const { setNodeRef, isOver } = useDroppable({
    id: status.key,
    disabled: !canManage,
  });

  const tasks = column.data?.pages.flatMap((page) => page.items) ?? [];
  const total = column.data?.pages[0]?.pagination.total;
  const highlighted = isOver && canDrop;

  return (
    <section
      ref={setNodeRef}
      aria-label={status.name}
      className={cn(
        "flex min-h-40 min-w-72 flex-1 flex-col rounded-xl border bg-muted/40 p-2 transition-colors",
        highlighted && "border-primary/50 bg-primary/5",
      )}
    >
      <header className="flex items-center gap-2 px-2 py-1.5">
        <span className={cn("size-2 rounded-full", meta.dotClassName)} />
        <h3 className="truncate text-sm font-medium">{status.name}</h3>
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
            onClick={() => onCreate(status.key)}
            aria-label={`Add task to ${status.name}`}
          >
            <PlusIcon />
          </Button>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-2 p-1">
        {column.isPending &&
          Array.from({ length: 2 }, (_, i) => (
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
          <DraggableTaskCard
            key={task._id}
            task={task}
            canManage={canManage}
            statuses={workflow.statuses}
            onOpen={() => onOpen(task)}
            onEdit={() => onEdit(task)}
            onDelete={() => onDelete(task)}
            onMove={(next) => onMove(task, next)}
          />
        ))}

        {column.isSuccess && tasks.length === 0 && (
          <div
            className={cn(
              "flex flex-1 items-center justify-center rounded-lg border border-dashed p-6 text-xs text-muted-foreground",
              highlighted && "border-primary/50 text-primary",
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
  statuses: ProjectStatus[];
  className?: string;
  onOpen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMove?: (status: TaskStatus) => void;
}

function DraggableTaskCard(props: TaskCardProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: props.task._id,
    data: { task: props.task },
    disabled: !props.canManage,
  });
  return (
    <div
      ref={setNodeRef}
      // Pointer/touch dragging only; keyboard users move cards from the menu
      {...listeners}
      className={cn(
        props.canManage && "cursor-grab",
        isDragging && "opacity-40",
      )}
    >
      <TaskCard {...props} />
    </div>
  );
}

function TaskCard({
  task,
  canManage,
  statuses,
  className,
  onOpen,
  onEdit,
  onDelete,
  onMove,
}: TaskCardProps) {
  const allSubtasksDone =
    task.subtaskCount > 0 && task.completedSubtaskCount === task.subtaskCount;
  const isDone = task.statusCategory === "done";

  return (
    <article
      className={cn(
        "group/task relative space-y-2 rounded-lg border bg-card p-3 shadow-xs transition-all hover:border-foreground/20 hover:shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <h4
          className={cn(
            "min-w-0 flex-1 text-sm leading-snug font-medium wrap-break-word",
            isDone && "text-muted-foreground line-through",
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

        {canManage && onMove && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="relative z-10 -mt-0.5 -mr-1 opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 max-md:opacity-100"
                aria-label={`Actions for ${task.key}`}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Move to
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={task.status}
                onValueChange={(v) => onMove(v)}
              >
                {statuses.map((status) => (
                  <DropdownMenuRadioItem key={status.key} value={status.key}>
                    {status.name}
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

      {(task.epic || task.blockedByCount > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          <EpicChip epic={task.epic} />
          {task.blockedByCount > 0 && (
            <span
              className="inline-flex h-5 items-center gap-1 rounded-md bg-red-500/10 px-1.5 text-xs text-red-700 dark:text-red-400"
              title={`Blocked by ${task.blockedByCount} unfinished ${task.blockedByCount === 1 ? "task" : "tasks"}`}
            >
              <BanIcon className="size-3" />
              Blocked
            </span>
          )}
        </div>
      )}

      {(task.dueDate || task.labels.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          <DueDateBadge dueDate={task.dueDate} done={isDone} className="h-5" />
          <LabelList labels={task.labels} max={3} />
        </div>
      )}

      <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
        <TaskTypeIcon type={task.type} className="size-3.5" />
        <TaskKey value={task.key} className={cn(isDone && "line-through")} />
        <PriorityIcon priority={task.priority} className="size-3.5" />
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
          <span title="Last updated" className="hidden truncate sm:inline">
            {formatRelative(task.updatedAt)}
          </span>
        )}

        <span className="ml-auto flex items-center gap-2">
          <PointsBadge points={task.storyPoints} />
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
