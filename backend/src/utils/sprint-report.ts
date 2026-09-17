import { Types } from "mongoose";
import type {
  SprintDocument,
  SprintReportSource,
  SprintSnapshotEntry,
  SprintStats,
  Tally,
} from "../models/sprint.models.js";
import {
  REPORT_ACTIVITY_TYPES,
  TaskActivity,
  TaskActivityTypeEnum,
} from "../models/taskactivity.models.js";
import { Project } from "../models/project.models.js";
import { Task } from "../models/task.models.js";
import {
  StatusCategoryEnum,
  TaskStatusEnum,
  type TaskStatus,
} from "./constants.js";
import { categoryLookup, projectStatuses } from "./workflow.js";

/**
 * Sprint reports are rebuilt from task history. Each task's state over time is
 * found by starting from what it looks like now and undoing its report
 * activity (status, sprint and point changes, creation and deletion) newest
 * first. Sprints started before snapshots existed are reconstructed on a best
 * effort basis and flagged `approximate`.
 */

interface TaskState {
  exists: boolean;
  inSprint: boolean;
  status: TaskStatus;
  points: number | null;
}

/** `state` holds from `at` until the next segment starts */
interface Segment {
  at: number;
  state: TaskState;
}

interface ReportEvent {
  task: Types.ObjectId;
  type: string;
  from?: unknown;
  createdAt: Date;
}

export interface ReportTask {
  _id: string;
  key?: string;
  title: string;
  status: TaskStatus;
  storyPoints: number | null;
  deleted: boolean;
  addedAt?: string;
  removedAt?: string;
  doneAtStart?: boolean;
}

export interface SeriesPoint {
  /** "start" for the moment the sprint started, otherwise `YYYY-MM-DD` */
  date: string;
  scope: Tally | null;
  done: Tally | null;
  remaining: Tally | null;
}

/** A task in an admin-editable snapshot of a rebuilt sprint */
export interface CorrectionTask {
  _id: string;
  key?: string;
  title: string;
  deleted: boolean;
  storyPoints: number | null;
  done: boolean;
}

export interface SprintReport {
  sprint: {
    _id: Types.ObjectId;
    name: string;
    goal?: string;
    status: string;
    startDate?: Date;
    endDate?: Date;
    startedAt?: Date;
    completedAt?: Date;
  };
  approximate: boolean;
  /**
   * For sprints that predate reports: how the data was obtained, and the
   * committed / end task lists an admin can correct
   */
  correction?: {
    source: SprintReportSource;
    confirmedAt?: Date;
    committed: CorrectionTask[];
    /** Missing while the sprint is still active */
    atEnd?: CorrectionTask[];
  };
  timeZone: string;
  summary: Omit<SprintStats, "approximate" | "computedAt">;
  series: SeriesPoint[];
  tasks: {
    completed: ReportTask[];
    carriedOver: ReportTask[];
    added: ReportTask[];
    removed: ReportTask[];
  };
  /** Start / end membership as computed, used to freeze rebuilt sprints */
  snapshots: { start: SprintSnapshotEntry[]; end: SprintSnapshotEntry[] };
}

const DAY_MS = 24 * 60 * 60 * 1000;

const tally = (): Tally => ({ count: 0, points: 0 });

const addTo = (target: Tally, points: number | null) => {
  target.count += 1;
  target.points += points ?? 0;
};

/** Avoids 0.1 + 0.2 style noise in point totals */
const roundTally = ({ count, points }: Tally): Tally => ({
  count,
  points: Math.round(points * 10) / 10,
});

const idOf = (value: unknown) =>
  value && typeof value === "object" && "_id" in value
    ? String((value as { _id: unknown })._id)
    : null;

// ---------- Time zones ----------

export const isValidTimeZone = (timeZone: unknown) => {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

const formatters = new Map<string, Intl.DateTimeFormat>();

const partsFormatter = (timeZone: string) => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
};

/** Wall-clock time in `timeZone` minus UTC, in ms */
const zoneOffset = (instant: number, timeZone: string) => {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  const wallClock = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return wallClock - Math.floor(instant / 1000) * 1000;
};

/** `YYYY-MM-DD` of an instant in `timeZone` */
export const dayKey = (instant: Date | number, timeZone: string) => {
  const time = typeof instant === "number" ? instant : instant.getTime();
  return new Date(time + zoneOffset(time, timeZone)).toISOString().slice(0, 10);
};

/** The instant a calendar day starts in `timeZone` */
export const startOfDay = (key: string, timeZone: string) => {
  const midnightUtc = Date.parse(`${key}T00:00:00.000Z`);
  let instant = midnightUtc - zoneOffset(midnightUtc, timeZone);
  // A second pass settles days where the offset changes (DST)
  instant = midnightUtc - zoneOffset(instant, timeZone);
  return instant;
};

const nextDay = (key: string) =>
  new Date(Date.parse(`${key}T00:00:00.000Z`) + DAY_MS)
    .toISOString()
    .slice(0, 10);

/** Calendar day of a date stored at 12:00 UTC */
const storedDayKey = (date: Date) => date.toISOString().slice(0, 10);

// ---------- Task timelines ----------

const undo = (
  state: TaskState,
  event: ReportEvent,
  sprintId: string,
): TaskState => {
  switch (event.type) {
    case TaskActivityTypeEnum.SPRINT_CHANGED:
      return { ...state, inSprint: idOf(event.from) === sprintId };
    case TaskActivityTypeEnum.STATUS_CHANGED:
      return { ...state, status: event.from as TaskStatus };
    case TaskActivityTypeEnum.POINTS_CHANGED:
      return {
        ...state,
        points: typeof event.from === "number" ? event.from : null,
      };
    case TaskActivityTypeEnum.DELETED: {
      const before = (event.from ?? {}) as {
        status?: TaskStatus;
        storyPoints?: number | null;
        sprint?: unknown;
      };
      return {
        exists: true,
        inSprint: idOf(before.sprint) === sprintId,
        status: before.status ?? state.status,
        points: before.storyPoints ?? null,
      };
    }
    case TaskActivityTypeEnum.CREATED:
      return { ...state, exists: false, inSprint: false };
    default:
      return state;
  }
};

const buildTimeline = (
  endState: TaskState,
  events: ReportEvent[],
  sprintId: string,
): Segment[] => {
  const segments: Segment[] = [];
  let state = endState;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    segments.push({ at: event.createdAt.getTime(), state });
    state = undo(state, event, sprintId);
  }
  segments.push({ at: -Infinity, state });
  return segments.reverse();
};

const stateAt = (timeline: Segment[], time: number): TaskState => {
  let low = 0;
  let high = timeline.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (timeline[mid]!.at <= time) low = mid;
    else high = mid - 1;
  }
  return timeline[low]!.state;
};

const isIn = (state: TaskState) => state.exists && state.inSprint;

/** Replaces the task's state within [from, to) using `patch` */
const overrideRange = (
  timeline: Segment[],
  from: number,
  to: number,
  patch: (state: TaskState) => TaskState,
): Segment[] => {
  const boundaries = [
    ...new Set([...timeline.map((segment) => segment.at), from, to]),
  ].sort((a, b) => a - b);
  return boundaries.map((at) => {
    const state = stateAt(timeline, at);
    return { at, state: at >= from && at < to ? patch(state) : state };
  });
};

// ---------- Report ----------

interface LoadedTask {
  id: string;
  key?: string;
  title: string;
  deleted: boolean;
  timeline: Segment[];
}

const loadTasks = async (sprint: SprintDocument): Promise<LoadedTask[]> => {
  const sprintId = sprint._id;
  const [moved, current] = await Promise.all([
    TaskActivity.find(
      {
        project: sprint.project,
        $or: [
          {
            type: TaskActivityTypeEnum.SPRINT_CHANGED,
            $or: [{ "to._id": sprintId }, { "from._id": sprintId }],
          },
          {
            type: TaskActivityTypeEnum.DELETED,
            "from.sprint._id": sprintId,
          },
        ],
      },
      "task",
    ).lean(),
    Task.find({ sprint: sprintId }, "_id").lean(),
  ]);

  const ids = new Map<string, Types.ObjectId>();
  for (const entry of [
    ...(sprint.startSnapshot ?? []),
    ...(sprint.endSnapshot ?? []),
  ]) {
    ids.set(String(entry.task), entry.task);
  }
  for (const { task } of moved) ids.set(String(task), task);
  for (const { _id } of current) ids.set(String(_id), _id);
  const taskIds = [...ids.values()];

  const [tasks, events] = await Promise.all([
    Task.find(
      { _id: { $in: taskIds } },
      "key title status storyPoints sprint",
    ).lean(),
    TaskActivity.find(
      { task: { $in: taskIds }, type: { $in: REPORT_ACTIVITY_TYPES } },
      "task type from createdAt",
    )
      .sort({ createdAt: 1, _id: 1 })
      .lean<ReportEvent[]>(),
  ]);

  const tasksById = new Map(tasks.map((task) => [String(task._id), task]));
  const eventsById = new Map<string, ReportEvent[]>();
  for (const event of events) {
    const key = String(event.task);
    const list = eventsById.get(key) ?? [];
    list.push(event);
    eventsById.set(key, list);
  }
  const snapshotById = new Map(
    (sprint.startSnapshot ?? []).map((entry) => [String(entry.task), entry]),
  );
  const sprintKey = String(sprintId);

  return taskIds.map((oid) => {
    const id = String(oid);
    const task = tasksById.get(id);
    const taskEvents = eventsById.get(id) ?? [];

    if (task) {
      return {
        id,
        key: task.key,
        title: task.title,
        deleted: false,
        timeline: buildTimeline(
          {
            exists: true,
            inSprint: String(task.sprint ?? "") === sprintKey,
            status: task.status,
            points: task.storyPoints ?? null,
          },
          taskEvents,
          sprintKey,
        ),
      };
    }

    // Deleted: its last known values come from the deletion record
    const deletion = taskEvents.findLast(
      (event) => event.type === TaskActivityTypeEnum.DELETED,
    )?.from as
      | { title?: string; key?: string; status?: TaskStatus }
      | undefined;
    const snapshot = snapshotById.get(id);
    return {
      id,
      key: deletion?.key,
      title: deletion?.title ?? "Deleted task",
      deleted: true,
      timeline: buildTimeline(
        {
          exists: false,
          inSprint: false,
          status: deletion?.status ?? snapshot?.status ?? TaskStatusEnum.TODO,
          points: snapshot?.storyPoints ?? null,
        },
        taskEvents,
        sprintKey,
      ),
    };
  });
};

/**
 * Builds a sprint's report as of `asOf` (default: now, or when the sprint was
 * completed). Only started sprints have reports.
 */
export const buildSprintReport = async (
  sprint: SprintDocument,
  { asOf, timeZone = "UTC" }: { asOf?: Date; timeZone?: string } = {},
): Promise<SprintReport> => {
  const startedAt = sprint.startedAt ?? sprint.startDate ?? sprint.createdAt;
  const S = startedAt.getTime();
  const E = Math.max(
    S + 1,
    Math.min(
      (sprint.completedAt ?? new Date()).getTime(),
      (asOf ?? new Date()).getTime(),
    ),
  );
  const sprintKey = String(sprint._id);
  const snapshot = sprint.startSnapshot;
  // Recorded as it happened, or confirmed by an admin
  const approximate = !snapshot || sprint.reportSource === "rebuilt";

  const [tasks, project] = await Promise.all([
    loadTasks(sprint),
    Project.findById(sprint.project, "statuses").lean(),
  ]);
  // Statuses are per project; "done" means a status in the Done category
  const categoryOf = categoryLookup(projectStatuses(project ?? {}));
  const isDone = (status: TaskStatus) =>
    categoryOf(status) === StatusCategoryEnum.DONE;
  const snapshotById = new Map(
    (snapshot ?? []).map((entry) => [String(entry.task), entry]),
  );

  // Rebuilt or corrected sprints: the stored lists decide who was in the
  // sprint at the start and end, even where history says otherwise
  const endSnapshot = sprint.completedAt ? sprint.endSnapshot : undefined;
  if (snapshot && (endSnapshot || sprint.reportSource)) {
    const endById = new Map(
      (endSnapshot ?? []).map((entry) => [String(entry.task), entry]),
    );
    for (const task of tasks) {
      const start = snapshotById.get(task.id);
      const end = endById.get(task.id);
      let timeline = task.timeline;
      const inAt = (time: number) => isIn(stateAt(timeline, time));
      const enter = (state: TaskState) => ({
        ...state,
        exists: true,
        inSprint: true,
      });

      if (start && !inAt(S)) {
        // Committed but history lost the membership: in from the start, until
        // it left (or the end, if it was still there)
        const leftAt = endSnapshot && !end ? S + 1 : E;
        timeline = overrideRange(timeline, S, leftAt, enter);
      }
      if (endSnapshot) {
        if (end) {
          if (!inAt(E - 1)) {
            const firstIn = timeline.find(
              (segment) => segment.at >= S && isIn(segment.state),
            )?.at;
            timeline = overrideRange(
              timeline,
              Math.max(S, Math.min(firstIn ?? S, E - 1)),
              E,
              enter,
            );
          }
          timeline = overrideRange(timeline, E - 1, E, (state) => ({
            ...enter(state),
            status: end.status,
            points: end.storyPoints ?? null,
          }));
        } else if (inAt(E - 1)) {
          timeline = overrideRange(timeline, E - 1, E, (state) => ({
            ...state,
            inSprint: false,
          }));
        }
      }
      task.timeline = timeline;
    }
  }

  const committed = tally();
  const completed = tally();
  const added = tally();
  const removed = tally();
  const carriedOver = tally();
  let estimateDelta = 0;
  let unestimated = 0;
  const startDone = tally();

  const lists: SprintReport["tasks"] = {
    completed: [],
    carriedOver: [],
    added: [],
    removed: [],
  };
  /** Tasks in the sprint at some point, used for the daily series */
  const everIn: LoadedTask[] = [];
  const snapshots: SprintReport["snapshots"] = { start: [], end: [] };
  const toEntry = (
    id: string,
    state: Pick<TaskState, "status" | "points">,
  ) => ({
    task: new Types.ObjectId(id),
    status: state.status,
    ...(state.points !== null && { storyPoints: state.points }),
  });

  for (const task of tasks) {
    const { timeline } = task;
    let startState: Pick<TaskState, "status" | "points"> | undefined;
    if (snapshot) {
      const entry = snapshotById.get(task.id);
      if (entry) {
        startState = {
          status: entry.status,
          points: entry.storyPoints ?? null,
        };
      }
    } else if (isIn(stateAt(timeline, S))) {
      startState = stateAt(timeline, S);
    }
    const wasCommitted = startState !== undefined;

    // Walk the segments inside (S, E) to find when the task was in the sprint
    let firstInAt: number | null = wasCommitted ? S : null;
    let lastIn: TaskState | null = null;
    let lastLeftAt: number | null = null;
    for (let i = 0; i < timeline.length; i++) {
      const segment = timeline[i]!;
      const segmentEnd = timeline[i + 1]?.at ?? Infinity;
      if (segment.at >= E || segmentEnd <= S) continue;
      if (isIn(segment.state)) {
        firstInAt ??= Math.max(segment.at, S);
        lastIn = segment.state;
      } else if (lastIn && segment.at > S) {
        lastLeftAt = segment.at;
      }
    }
    if (!wasCommitted && !lastIn) continue;
    everIn.push(task);

    const endState = stateAt(timeline, E - 1);
    const inAtEnd = isIn(endState);
    // A committed task can have no in-sprint segment if it left as it started
    const finalState: TaskState = lastIn ?? { ...endState, ...startState };
    const reportTask: ReportTask = {
      _id: task.id,
      key: task.key,
      title: task.title,
      status: (inAtEnd ? endState : finalState).status,
      storyPoints: (inAtEnd ? endState : finalState).points,
      deleted: task.deleted,
    };

    if (startState) {
      snapshots.start.push(toEntry(task.id, startState));
      addTo(committed, startState.points);
      estimateDelta +=
        (lastIn?.points ?? startState.points ?? 0) - (startState.points ?? 0);
      if (isDone(startState.status)) {
        addTo(startDone, startState.points);
        reportTask.doneAtStart = true;
      }
    } else if (lastIn) {
      addTo(added, lastIn.points);
      if (firstInAt !== null) {
        reportTask.addedAt = new Date(firstInAt).toISOString();
      }
      lists.added.push(reportTask);
    }

    if (inAtEnd) {
      snapshots.end.push(toEntry(task.id, endState));
      if (endState.points === null) unestimated += 1;
      if (isDone(endState.status)) {
        addTo(completed, endState.points);
        lists.completed.push(reportTask);
      } else {
        addTo(carriedOver, endState.points);
        lists.carriedOver.push(reportTask);
      }
    } else {
      addTo(removed, lastIn?.points ?? startState?.points ?? null);
      if (lastLeftAt !== null) {
        reportTask.removedAt = new Date(lastLeftAt).toISOString();
      }
      lists.removed.push(reportTask);
    }
  }

  // committed + added − removed (+ estimate changes) = completed + carried over
  const left = committed.count + added.count - removed.count;
  const right = completed.count + carriedOver.count;
  const leftPoints =
    committed.points + added.points - removed.points + estimateDelta;
  const rightPoints = completed.points + carriedOver.points;
  if (left !== right || Math.abs(leftPoints - rightPoints) > 1e-6) {
    console.warn(`Sprint report totals don't add up for sprint ${sprintKey}`, {
      left,
      right,
      leftPoints,
      rightPoints,
    });
  }

  // ---------- Daily series ----------
  const firstDay = [
    sprint.startDate ? storedDayKey(sprint.startDate) : null,
    dayKey(S, timeZone),
  ]
    .filter((key): key is string => key !== null)
    .sort()[0]!;
  const lastDay = [
    sprint.endDate ? storedDayKey(sprint.endDate) : null,
    dayKey(E - 1, timeZone),
  ]
    .filter((key): key is string => key !== null)
    .sort()
    .at(-1)!;

  const series: SeriesPoint[] = [
    {
      date: "start",
      scope: roundTally(committed),
      done: roundTally(startDone),
      remaining: roundTally({
        count: committed.count - startDone.count,
        points: committed.points - startDone.points,
      }),
    },
  ];
  // Guard against bad dates producing an endless loop
  for (let key = firstDay, guard = 0; key <= lastDay && guard < 400; guard++) {
    const dayStart = startOfDay(key, timeZone);
    const next = nextDay(key);
    if (dayStart >= E) {
      series.push({ date: key, scope: null, done: null, remaining: null });
    } else {
      const time = Math.min(Math.max(startOfDay(next, timeZone), S + 1), E) - 1;
      const scope = tally();
      const done = tally();
      for (const task of everIn) {
        const state = stateAt(task.timeline, time);
        if (!isIn(state)) continue;
        addTo(scope, state.points);
        if (isDone(state.status)) addTo(done, state.points);
      }
      series.push({
        date: key,
        scope: roundTally(scope),
        done: roundTally(done),
        remaining: roundTally({
          count: scope.count - done.count,
          points: scope.points - done.points,
        }),
      });
    }
    key = next;
  }

  // What an admin reviews when correcting a sprint from before reports
  let correction: SprintReport["correction"];
  if (sprint.reportSource) {
    const infoById = new Map(tasks.map((task) => [task.id, task]));
    const describe = (entry: SprintSnapshotEntry): CorrectionTask => {
      const info = infoById.get(String(entry.task));
      return {
        _id: String(entry.task),
        key: info?.key,
        title: info?.title ?? "Deleted task",
        deleted: info?.deleted ?? true,
        storyPoints: entry.storyPoints ?? null,
        done: isDone(entry.status),
      };
    };
    correction = {
      source: sprint.reportSource,
      confirmedAt: sprint.reportConfirmedAt,
      committed: snapshots.start.map(describe),
      atEnd: sprint.completedAt ? snapshots.end.map(describe) : undefined,
    };
  }

  return {
    sprint: {
      _id: sprint._id,
      name: sprint.name,
      goal: sprint.goal,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      startedAt: sprint.startedAt,
      completedAt: sprint.completedAt,
    },
    approximate,
    correction,
    timeZone,
    summary: {
      committed: roundTally(committed),
      completed: roundTally(completed),
      added: roundTally(added),
      removed: roundTally(removed),
      carriedOver: roundTally(carriedOver),
      estimateDelta: Math.round(estimateDelta * 10) / 10,
      unestimated,
    },
    series,
    tasks: lists,
    snapshots,
  };
};

/** Totals to store on a sprint when it's completed */
export const toSprintStats = (report: SprintReport): SprintStats => ({
  ...report.summary,
  approximate: report.approximate,
  computedAt: new Date(),
});
