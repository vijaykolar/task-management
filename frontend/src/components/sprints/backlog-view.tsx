import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { useCallback, useRef, useState } from "react";

import { UserAvatar } from "@/components/common/user-avatar";
import {
  CompleteSprintDialog,
  SprintFormDialog,
} from "@/components/sprints/sprint-dialogs";
import {
  DueDateBadge,
  LabelList,
  PointsBadge,
  PriorityIcon,
} from "@/components/tasks/task-fields";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { EpicChip, TaskKey, TaskTypeIcon } from "@/components/tasks/task-type";
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
import {
  useRankTask,
  useSprintTasks,
  useUpdateTask,
} from "@/features/tasks/hooks";
import { formatDueDate } from "@/lib/due-date";
import { displayName } from "@/lib/format";
import { formatPoints } from "@/lib/story-points";
import { cn } from "@/lib/utils";
import type { Sprint, TaskListItem } from "@/types/models";

const BACKLOG = "backlog";

interface DragData {
  kind: "task";
  task: TaskListItem;
  /** Sprint id the task is dragged from; "" = backlog */
  from: string;
}

/** Where a dragged task would land if dropped now */
interface DropTarget {
  /** Sprint id; "" = backlog */
  sectionId: string;
  afterId?: string;
  beforeId?: string;
}

const isTaskData = (data: unknown): data is DragData =>
  (data as DragData | undefined)?.kind === "task";

// Rows win over the section around them; fall back to the nearest row
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const rows = hits.filter(({ id }) => !String(id).startsWith("section-"));
  if (rows.length > 0) return rows;
  return hits.length > 0 ? hits : closestCenter(args);
};

/** Current pointer height: where the drag started plus how far it moved */
function pointerY(event: DragMoveEvent) {
  const start = event.activatorEvent;
  const startY =
    "touches" in start
      ? (start as TouchEvent).touches[0]?.clientY
      : (start as MouseEvent).clientY;
  return startY === undefined ? undefined : startY + event.delta.y;
}

/**
 * Works out the drop position. Within a section, a task dragged down lands
 * after the row it's over and one dragged up lands before it. From another
 * section, it lands above or below the row depending on which half of the
 * row the pointer is in.
 */
function resolveDropTarget(
  { active, over, ...event }: DragMoveEvent,
  sectionItems: Map<string, TaskListItem[]>,
): DropTarget | null {
  const data = active.data.current;
  if (!over || !isTaskData(data)) return null;
  const overData = over.data.current;

  if (isTaskData(overData)) {
    if (overData.task._id === data.task._id) return null;
    const sectionId = overData.from;
    const items = sectionItems.get(sectionId) ?? [];
    let below: boolean;
    if (sectionId === data.from) {
      const from = items.findIndex((item) => item._id === data.task._id);
      const to = items.findIndex((item) => item._id === overData.task._id);
      below = from !== -1 && from < to;
    } else {
      const y = pointerY({ active, over, ...event });
      const dragged = active.rect.current.translated;
      const middle = over.rect.top + over.rect.height / 2;
      below =
        y !== undefined
          ? y > middle
          : !!dragged && dragged.top + dragged.height / 2 > middle;
    }
    return below
      ? { sectionId, afterId: overData.task._id }
      : { sectionId, beforeId: overData.task._id };
  }

  // Dropped on a section, not a row: add it to the end of that list
  const sectionId = overData?.sprintId as string | undefined;
  if (sectionId === undefined) return null;
  const others = (sectionItems.get(sectionId) ?? []).filter(
    (item) => item._id !== data.task._id,
  );
  return { sectionId, afterId: others.at(-1)?._id };
}

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
  const rankTask = useRankTask(projectId);
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

  const [dragged, setDragged] = useState<DragData | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // The loaded tasks of each section, in order, for working out drop positions
  const sectionItems = useRef(new Map<string, TaskListItem[]>());
  const registerItems = useCallback(
    (sectionId: string, items: TaskListItem[]) =>
      sectionItems.current.set(sectionId, items),
    [],
  );

  // A small movement threshold keeps clicks on rows working
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
  );

  const endDrag = () => {
    setDragged(null);
    setDropTarget(null);
  };

  // Recomputed on every move so the drop line follows the pointer within a row
  const handleDragMove = (event: DragMoveEvent) => {
    const next = resolveDropTarget(event, sectionItems.current);
    setDropTarget((current) =>
      current?.sectionId === next?.sectionId &&
      current?.afterId === next?.afterId &&
      current?.beforeId === next?.beforeId
        ? current
        : next,
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const data = event.active.data.current;
    const target = resolveDropTarget(event, sectionItems.current);
    endDrag();
    if (!target || !isTaskData(data)) return;

    // Dropping a task back where it was changes nothing
    if (target.sectionId === data.from) {
      const items = sectionItems.current.get(target.sectionId) ?? [];
      const index = items.findIndex((item) => item._id === data.task._id);
      if (
        (target.afterId && items[index - 1]?._id === target.afterId) ||
        (target.beforeId && items[index + 1]?._id === target.beforeId) ||
        (!target.afterId && !target.beforeId && index === items.length - 1)
      ) {
        return;
      }
    }

    rankTask.mutate({
      taskId: data.task._id,
      sprint: target.sectionId,
      afterId: target.afterId,
      beforeId: target.beforeId,
    });
  };

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
    dragged,
    dropTarget,
    registerItems,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={({ active }) =>
        setDragged(isTaskData(active.data.current) ? active.data.current : null)
      }
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={endDrag}
    >
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
                {!!sprints.data?.backlog.pointCount &&
                  ` · ${formatPoints(sprints.data.backlog.pointCount)}`}
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
                Its {deleting?.taskCount ?? 0} tasks move back to the backlog.
                The tasks themselves are not deleted.
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
      <DragOverlay dropAnimation={null}>
        {dragged && (
          <ul className="rounded-lg border bg-card shadow-lg">
            <BacklogRowContent
              task={dragged.task}
              projectId={projectId}
              sectionId={dragged.from}
              canManage={false}
              moveTargets={[]}
            />
          </ul>
        )}
      </DragOverlay>
    </DndContext>
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
              {sprint.pointCount > 0 &&
                ` · ${sprint.donePoints}/${formatPoints(sprint.pointCount)}`}
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
  dragged: DragData | null;
  dropTarget: DropTarget | null;
  registerItems: (sectionId: string, items: TaskListItem[]) => void;
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
  dragged,
  dropTarget,
  registerItems,
  onOpenTask,
  onMoveTask,
}: TaskSectionProps) {
  const sectionId = sprint?._id ?? "";
  const tasks = useSprintTasks(projectId, sprint?._id ?? BACKLOG);
  const items = tasks.data?.pages.flatMap((page) => page.items) ?? [];
  const total = tasks.data?.pages[0]?.pagination.total ?? 0;
  const acceptsDrops = canManage && sprint?.status !== "completed";
  const { setNodeRef } = useDroppable({
    id: `section-${sectionId || BACKLOG}`,
    data: { sprintId: sectionId },
    disabled: !acceptsDrops,
  });
  registerItems(sectionId, items);
  // Tasks coming from another list: highlight the list and mark the gap
  const incoming =
    !!dragged &&
    dragged.from !== sectionId &&
    dropTarget?.sectionId === sectionId;

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "rounded-xl border bg-card transition-colors",
        incoming && "border-primary/50 bg-primary/5",
      )}
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
          <li
            className={cn(
              "px-4 py-6 text-center text-sm text-muted-foreground",
              incoming && "text-primary",
            )}
          >
            {sprint
              ? canManage
                ? "Drag tasks here from the backlog to plan this sprint"
                : "No tasks in this sprint"
              : "The backlog is empty"}
          </li>
        )}

        <SortableContext
          items={items.map((task) => task._id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((task) => (
            <BacklogRow
              key={task._id}
              task={task}
              projectId={projectId}
              sectionId={sectionId}
              canManage={acceptsDrops}
              moveTargets={moveTargets}
              dropIndicator={
                incoming
                  ? dropTarget?.beforeId === task._id
                    ? "before"
                    : dropTarget?.afterId === task._id
                      ? "after"
                      : undefined
                  : undefined
              }
              onOpen={() => onOpenTask(task._id)}
              onMove={(sprintId) => onMoveTask(task._id, sprintId)}
            />
          ))}
        </SortableContext>
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

interface BacklogRowProps {
  task: TaskListItem;
  projectId: string;
  sectionId: string;
  canManage: boolean;
  moveTargets: Sprint[];
  /** Line showing where a task from another list will be dropped */
  dropIndicator?: "before" | "after";
  onOpen?: () => void;
  onMove?: (sprintId: string) => void;
}

function BacklogRow(props: BacklogRowProps) {
  const { setNodeRef, listeners, isDragging, transform, transition } =
    useSortable({
      id: props.task._id,
      data: {
        kind: "task",
        task: props.task,
        from: props.sectionId,
      } satisfies DragData,
      disabled: !props.canManage,
    });
  return (
    <BacklogRowContent
      {...props}
      rowRef={setNodeRef}
      // Rows in the same list slide apart to show where the task will land
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // Pointer/touch dragging only; keyboard users move tasks from the menu
      dragListeners={listeners}
      isDragging={isDragging}
    />
  );
}

function BacklogRowContent({
  task,
  projectId,
  sectionId,
  canManage,
  moveTargets,
  onOpen,
  onMove,
  dropIndicator,
  rowRef,
  style,
  dragListeners,
  isDragging,
}: BacklogRowProps & {
  rowRef?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  isDragging?: boolean;
}) {
  const isDone = task.statusCategory === "done";
  return (
    <li
      ref={rowRef}
      style={style}
      {...dragListeners}
      className={cn(
        "group/row relative flex items-center gap-3 bg-card px-4 py-2.5 text-sm hover:bg-muted/40",
        canManage && "cursor-grab active:cursor-grabbing",
        isDragging && "relative z-10 opacity-40",
        dropIndicator &&
          "after:pointer-events-none after:absolute after:inset-x-2 after:h-0.5 after:rounded-full after:bg-primary",
        dropIndicator === "before" && "after:-top-px",
        dropIndicator === "after" && "after:-bottom-px",
      )}
    >
      <TaskTypeIcon type={task.type} />
      <TaskKey
        value={task.key}
        className={cn("w-16", isDone && "line-through")}
      />
      <PriorityIcon priority={task.priority} />
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "min-w-0 flex-1 truncate text-left font-medium after:absolute after:inset-0 focus-visible:outline-none",
          isDone && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </button>
      <EpicChip epic={task.epic} className="hidden lg:inline-flex" />
      <LabelList labels={task.labels} max={2} className="hidden md:flex" />
      <DueDateBadge
        dueDate={task.dueDate}
        done={isDone}
        className="hidden h-5 sm:inline-flex"
      />
      <PointsBadge points={task.storyPoints} />
      <TaskStatusBadge
        status={task.status}
        projectId={projectId}
        className="hidden sm:inline-flex"
      />
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

      {canManage && onMove && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="relative z-10 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 max-md:opacity-100"
              aria-label={`Move ${task.key}`}
              onPointerDown={(event) => event.stopPropagation()}
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
