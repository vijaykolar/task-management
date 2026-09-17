import {
  CalendarPlusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MapIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { TaskTypeIcon } from "@/components/tasks/task-type";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRoadmap, useUpdateTask } from "@/features/tasks/hooks";
import { statusCategoryMeta } from "@/lib/task-status";
import { cn } from "@/lib/utils";
import type {
  Roadmap,
  RoadmapEpic,
  RoadmapTask,
  StatusCategory,
} from "@/types/models";

import {
  addDays,
  dayLabel,
  dayOf,
  daysBetween,
  firstOfMonth,
  monthLabel,
  monthsIn,
  startOfNextMonth,
  todayKey,
  weekendsIn,
} from "./roadmap-dates";

const ZOOMS = {
  weeks: { label: "Weeks", pxPerDay: 26, showDays: true },
  months: { label: "Months", pxPerDay: 9, showDays: false },
  quarters: { label: "Quarters", pxPerDay: 3.2, showDays: false },
} as const;

type Zoom = keyof typeof ZOOMS;

const LANE_WIDTH = 260;
const ROW_HEIGHT = 40;
const BAR_HEIGHT = 24;

/**
 * Bars are filled, not outlined, so a glance reads as a timeline. One set of
 * colours for both themes: these are dark enough for white text anywhere, and
 * saturated enough to stand out on a dark card.
 */
const BAR_TONES: Record<StatusCategory, string> = {
  todo: "bg-slate-600",
  in_progress: "bg-sky-700",
  done: "bg-emerald-700",
};

/** A task's span: what the bar covers, and whether it is the task's own */
interface Span {
  start: string;
  end: string;
  /** Borrowed from the children, because the epic has no dates of its own */
  derived?: boolean;
}

const spanOfTask = (task: RoadmapTask): Span | undefined => {
  const start = dayOf(task.startDate);
  const end = dayOf(task.dueDate);
  if (!start && !end) return undefined;
  return { start: start ?? end!, end: end ?? start! };
};

const spanOfEpic = (epic: RoadmapEpic): Span | undefined => {
  const own = spanOfTask(epic);
  if (own) return own;
  const start = dayOf(epic.derivedStart);
  const end = dayOf(epic.derivedEnd);
  if (!start && !end) return undefined;
  return { start: start ?? end!, end: end ?? start!, derived: true };
};

/** One line of the timeline */
interface Row {
  id: string;
  depth: 0 | 1;
  task: RoadmapTask;
  span?: Span;
  epic?: RoadmapEpic;
  expanded?: boolean;
}

type DragMode = "move" | "start" | "end";

interface Draft {
  taskId: string;
  mode: DragMode;
  days: number;
}

export function RoadmapView({
  projectId,
  onOpenTask,
  canManage,
}: {
  projectId: string;
  onOpenTask: (taskId: string) => void;
  canManage: boolean;
}) {
  const { data, isPending } = useRoadmap(projectId);
  const updateTask = useUpdateTask(projectId);
  const [zoom, setZoom] = useState<Zoom>("months");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Draft | undefined>();
  const scroller = useRef<HTMLDivElement>(null);

  const { pxPerDay, showDays } = ZOOMS[zoom];
  const rows = useMemo(() => buildRows(data, open), [data, open]);
  const window = useMemo(() => windowOf(rows), [rows]);

  const months = useMemo(
    () => monthsIn(window.from, window.to),
    [window.from, window.to],
  );
  const weekends = useMemo(
    () => (showDays ? weekendsIn(window.from, window.to) : []),
    [window.from, window.to, showDays],
  );

  const totalDays = daysBetween(window.from, window.to) + 1;
  const width = totalDays * pxPerDay;
  const x = (key: string) => daysBetween(window.from, key) * pxPerDay;

  /** Drag and resize: the pointer moves days, and a release saves them */
  const startDrag = (
    event: React.PointerEvent,
    task: RoadmapTask,
    span: Span,
    mode: DragMode,
  ) => {
    if (!canManage) return;
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const days = Math.round((moveEvent.clientX - originX) / pxPerDay);
      setDraft({ taskId: task._id, mode, days });
    };

    const finish = (upEvent: PointerEvent) => {
      target.releasePointerCapture(upEvent.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", finish);

      const days = Math.round((upEvent.clientX - originX) / pxPerDay);
      setDraft(undefined);
      if (days === 0) return;
      const next = applyDrag(span, mode, days);
      updateTask.mutate({
        taskId: task._id,
        startDate: next.start,
        dueDate: next.end,
      });
    };

    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", finish);
  };

  /** Gives an undated task a week to sit in, so it joins the timeline */
  const placeToday = (task: RoadmapTask) => {
    const start = todayKey();
    updateTask.mutate({
      taskId: task._id,
      startDate: start,
      dueDate: addDays(start, 4),
    });
  };

  const scrollToToday = () => {
    const today = todayKey();
    scroller.current?.scrollTo({
      left: Math.max(x(today) - 200, 0),
      behavior: "smooth",
    });
  };

  if (isPending) return <Skeleton className="h-96 w-full" />;

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing to plan yet</EmptyTitle>
          <EmptyDescription>
            The roadmap draws epics and any task with dates. Make an epic, or
            give a task a start and due date.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapIcon className="size-4" />
          {canManage
            ? "Drag a bar to move it, or its edges to change the dates."
            : "Epics and dated work over time."}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={scrollToToday}>
            Today
          </Button>
          <div className="flex rounded-md border p-0.5">
            {(Object.keys(ZOOMS) as Zoom[]).map((level) => (
              <Button
                key={level}
                size="sm"
                variant={zoom === level ? "secondary" : "ghost"}
                className="h-7 px-2 text-xs"
                onClick={() => setZoom(level)}
              >
                {ZOOMS[level].label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={scroller}
        className="relative overflow-x-auto rounded-lg border bg-card"
      >
        <div style={{ width: LANE_WIDTH + width }}>
          {/* ---------- Header ---------- */}
          <div className="sticky top-0 z-20 flex border-b bg-card">
            <div
              className="sticky left-0 z-10 shrink-0 border-r bg-card px-3 py-2 text-xs font-medium text-muted-foreground"
              style={{ width: LANE_WIDTH }}
            >
              {rows.length} {rows.length === 1 ? "item" : "items"}
            </div>
            <div className="relative" style={{ width }}>
              <div className="flex h-9 items-end">
                {months.map((month, index) => (
                  <div
                    key={month.key}
                    className="shrink-0 border-l px-2 pb-1 text-xs font-medium"
                    style={{ width: month.days * pxPerDay }}
                  >
                    <span
                      className={cn(index === 0 && "sr-only sm:not-sr-only")}
                    >
                      {monthLabel(month.key, index === 0)}
                    </span>
                  </div>
                ))}
              </div>
              {showDays && (
                <div className="flex h-5 items-center">
                  {Array.from({ length: totalDays }, (_, index) => {
                    const key = addDays(window.from, index);
                    return (
                      <div
                        key={key}
                        className="shrink-0 text-center text-[10px] text-muted-foreground"
                        style={{ width: pxPerDay }}
                      >
                        {dayLabel(key)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ---------- Rows ---------- */}
          <div className="relative">
            {/* Background: weekends, month lines and today */}
            <div
              className="pointer-events-none absolute inset-y-0"
              style={{ left: LANE_WIDTH, width }}
            >
              {weekends.map((run) => (
                <div
                  key={run.start}
                  className="absolute inset-y-0 bg-muted/40"
                  style={{ left: x(run.start), width: run.days * pxPerDay }}
                />
              ))}
              {months.map((month) => (
                <div
                  key={month.key}
                  className="absolute inset-y-0 w-px bg-border"
                  style={{ left: x(month.start) }}
                />
              ))}
              <div
                className="absolute inset-y-0 z-10 w-px bg-primary"
                style={{ left: x(todayKey()) }}
              />
            </div>

            {rows.map((row) => {
              const drafted =
                draft?.taskId === row.task._id && row.span
                  ? applyDrag(row.span, draft.mode, draft.days)
                  : row.span;
              return (
                <div
                  key={row.id}
                  className="flex items-center border-b last:border-b-0 hover:bg-accent/30"
                  style={{ height: ROW_HEIGHT }}
                >
                  <RowLabel
                    row={row}
                    onToggle={() =>
                      setOpen((current) => ({
                        ...current,
                        [row.task._id]: !current[row.task._id],
                      }))
                    }
                    onOpenTask={onOpenTask}
                  />
                  <div className="relative h-full" style={{ width }}>
                    {drafted ? (
                      <Bar
                        row={row}
                        span={drafted}
                        left={x(drafted.start)}
                        width={
                          (daysBetween(drafted.start, drafted.end) + 1) *
                          pxPerDay
                        }
                        canManage={canManage}
                        dragging={draft?.taskId === row.task._id}
                        onOpenTask={onOpenTask}
                        onStartDrag={(event, mode) =>
                          startDrag(event, row.task, row.span!, mode)
                        }
                      />
                    ) : (
                      canManage && (
                        <button
                          type="button"
                          onClick={() => placeToday(row.task)}
                          className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                          style={{ left: Math.max(x(todayKey()), 4) }}
                        >
                          <CalendarPlusIcon className="size-3" />
                          Set dates
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function RowLabel({
  row,
  onToggle,
  onOpenTask,
}: {
  row: Row;
  onToggle: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const hasChildren = (row.epic?.children.length ?? 0) > 0;
  return (
    <div
      className="sticky left-0 z-10 flex h-full shrink-0 items-center gap-1 border-r bg-card pr-2"
      style={{ width: LANE_WIDTH, paddingLeft: row.depth === 1 ? 28 : 4 }}
    >
      {hasChildren ? (
        <Button
          size="icon"
          variant="ghost"
          className="size-6 shrink-0"
          onClick={onToggle}
        >
          {row.expanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
          <span className="sr-only">
            {row.expanded ? "Collapse" : "Expand"} {row.task.title}
          </span>
        </Button>
      ) : (
        <span className="size-6 shrink-0" />
      )}
      <TaskTypeIcon type={row.task.type} className="size-4 shrink-0" />
      <button
        type="button"
        onClick={() => onOpenTask(row.task._id)}
        className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
        title={`${row.task.key} ${row.task.title}`}
      >
        <span className="font-mono text-xs text-muted-foreground">
          {row.task.key}
        </span>{" "}
        {row.task.title}
      </button>
      {row.epic && row.epic.children.length > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {row.epic.doneCount}/{row.epic.children.length}
        </span>
      )}
    </div>
  );
}

function Bar({
  row,
  span,
  left,
  width,
  canManage,
  dragging,
  onOpenTask,
  onStartDrag,
}: {
  row: Row;
  span: Span;
  left: number;
  width: number;
  canManage: boolean;
  dragging: boolean;
  onOpenTask: (taskId: string) => void;
  onStartDrag: (event: React.PointerEvent, mode: DragMode) => void;
}) {
  const tone = statusCategoryMeta[row.task.statusCategory];
  const isEpic = row.depth === 0;
  const days = daysBetween(span.start, span.end) + 1;
  // A single day is a moment, not a stretch of work, so it gets a marker
  const isMoment = days === 1;
  // Too narrow for a name inside it: put the name alongside instead
  const labelOutside = !isMoment && width < 64;
  const progress =
    isEpic && row.epic?.children.length
      ? row.epic.doneCount / row.epic.children.length
      : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onDoubleClick={() => onOpenTask(row.task._id)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onOpenTask(row.task._id);
          }}
          onPointerDown={(event) => onStartDrag(event, "move")}
          className={cn(
            "group absolute top-1/2 flex -translate-y-1/2 items-center",
            canManage ? "cursor-grab" : "cursor-pointer",
            dragging && "cursor-grabbing",
          )}
          style={{
            left,
            width: isMoment ? 14 : Math.max(width, 14),
            height: isEpic ? BAR_HEIGHT : BAR_HEIGHT - 4,
          }}
        >
          {isMoment ? (
            <>
              <span
                className={cn(
                  "size-3.5 rotate-45 rounded-xs border border-background",
                  BAR_TONES[row.task.statusCategory],
                  dragging && "ring-2 ring-primary",
                )}
              />
              <span className="pointer-events-none ml-2 whitespace-nowrap text-xs text-muted-foreground">
                {row.task.title}
              </span>
            </>
          ) : (
            <div
              className={cn(
                "relative flex h-full w-full items-center overflow-hidden rounded-md border border-black/10 px-2 text-xs text-white dark:border-white/15",
                BAR_TONES[row.task.statusCategory],
                isEpic && "font-medium",
                span.derived && "border-dashed bg-transparent",
                dragging && "ring-2 ring-primary",
              )}
            >
              {/* An epic fills up as the work inside it finishes */}
              {progress > 0 && !span.derived && (
                <span
                  className="absolute inset-y-0 left-0 bg-white/25"
                  style={{ width: `${progress * 100}%` }}
                />
              )}
              {span.derived && (
                <span
                  className={cn(
                    "absolute inset-0 opacity-25",
                    BAR_TONES[row.task.statusCategory],
                  )}
                />
              )}
              {canManage && !span.derived && (
                <span
                  onPointerDown={(event) => onStartDrag(event, "start")}
                  className="absolute left-0 z-10 h-full w-2 cursor-ew-resize opacity-0 group-hover:bg-black/25 group-hover:opacity-100"
                />
              )}
              {!labelOutside && (
                <span
                  className={cn(
                    "relative truncate",
                    span.derived && "text-foreground",
                  )}
                >
                  {row.task.title}
                </span>
              )}
              {canManage && !span.derived && (
                <span
                  onPointerDown={(event) => onStartDrag(event, "end")}
                  className="absolute right-0 z-10 h-full w-2 cursor-ew-resize opacity-0 group-hover:bg-black/25 group-hover:opacity-100"
                />
              )}
            </div>
          )}
          {labelOutside && (
            <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap text-xs text-muted-foreground">
              {row.task.title}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">
          {row.task.key} {row.task.title}
        </p>
        <p>
          {span.start} → {span.end} · {days} {days === 1 ? "day" : "days"}
        </p>
        <p>{tone.label}</p>
        {span.derived && <p>Taken from the work inside it</p>}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------- Model ----------

/** Flattens the roadmap into rows, with each epic's children under it */
function buildRows(
  data: Roadmap | undefined,
  open: Record<string, boolean>,
): Row[] {
  if (!data) return [];
  const rows: Row[] = [];
  for (const epic of data.epics) {
    const expanded = open[epic._id] ?? false;
    rows.push({
      id: epic._id,
      depth: 0,
      task: epic,
      span: spanOfEpic(epic),
      epic,
      expanded,
    });
    if (!expanded) continue;
    for (const child of epic.children) {
      rows.push({
        id: `${epic._id}:${child._id}`,
        depth: 1,
        task: child,
        span: spanOfTask(child),
      });
    }
  }
  for (const task of data.loose) {
    rows.push({ id: task._id, depth: 0, task, span: spanOfTask(task) });
  }
  return rows;
}

/** The window the timeline covers: the work, plus room around it */
function windowOf(rows: Row[]) {
  const today = todayKey();
  let from = today;
  let to = today;
  for (const row of rows) {
    if (!row.span) continue;
    if (row.span.start < from) from = row.span.start;
    if (row.span.end > to) to = row.span.end;
  }
  // Whole months, with a margin so bars never touch the edges
  return {
    from: firstOfMonth(addDays(from, -10)),
    to: addDays(startOfNextMonth(addDays(to, 10)), -1),
  };
}

/** Where a bar lands after a drag of `days`, keeping start on or before end */
function applyDrag(span: Span, mode: DragMode, days: number): Span {
  if (mode === "move") {
    return { start: addDays(span.start, days), end: addDays(span.end, days) };
  }
  if (mode === "start") {
    const start = addDays(span.start, days);
    return { start: start > span.end ? span.end : start, end: span.end };
  }
  const end = addDays(span.end, days);
  return { start: span.start, end: end < span.start ? span.start : end };
}
