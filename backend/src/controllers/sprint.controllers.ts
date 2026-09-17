import { Project } from "../models/project.models.js";
import {
  Sprint,
  SprintStatusEnum,
  type SprintSnapshotEntry,
} from "../models/sprint.models.js";
import { TaskActivityTypeEnum } from "../models/taskactivity.models.js";
import { Task } from "../models/task.models.js";
import { logActivities } from "../utils/activity.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  runSprintAutomations,
  type AutomationActor,
} from "../utils/automation.js";
import { StatusCategoryEnum } from "../utils/constants.js";
import { toObjectId } from "../utils/object-id.js";
import { requireUser } from "../utils/request-user.js";
import { buildSprintReport, toSprintStats } from "../utils/sprint-report.js";
import { findSprintInProject } from "../utils/sprints.js";
import {
  parseDueDate,
  parseStoryPoints,
  startOfTodayUtc,
} from "../utils/task-fields.js";
import {
  activeStatuses,
  categoryLookup,
  projectStatuses,
} from "../utils/workflow.js";

type ProjectParams = { projectId: string };
type SprintParams = ProjectParams & { sprintId: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SPRINT_DAYS = 14;

const sumPoints = (input: string) => ({
  $sum: {
    $map: { input, in: { $ifNull: ["$$this.storyPoints", 0] } },
  },
});

const assertDateOrder = (start?: Date | null, end?: Date | null) => {
  if (start && end && end < start) {
    throw new ApiError(422, "The end date must be on or after the start date");
  }
};

/**
 * GET /sprints/:projectId — active sprint first, then planned, then completed,
 * each with task counts, plus backlog counts.
 */
const getSprints = asyncHandler<ProjectParams>(async (req, res) => {
  const projectId = toObjectId(req.params.projectId, "project id");

  const [sprints, backlog] = await Promise.all([
    Sprint.aggregate([
      { $match: { project: projectId } },
      {
        $lookup: {
          from: "tasks",
          localField: "_id",
          foreignField: "sprint",
          as: "tasks",
          pipeline: [{ $project: { statusCategory: 1, storyPoints: 1 } }],
        },
      },
      {
        $addFields: {
          doneTasks: {
            $filter: {
              input: "$tasks",
              cond: { $eq: ["$$this.statusCategory", StatusCategoryEnum.DONE] },
            },
          },
        },
      },
      {
        $addFields: {
          taskCount: { $size: "$tasks" },
          doneCount: { $size: "$doneTasks" },
          pointCount: sumPoints("$tasks"),
          donePoints: sumPoints("$doneTasks"),
          statusRank: {
            $indexOfArray: [
              [
                SprintStatusEnum.ACTIVE,
                SprintStatusEnum.PLANNED,
                SprintStatusEnum.COMPLETED,
              ],
              "$status",
            ],
          },
          completedSort: { $ifNull: ["$completedAt", "$createdAt"] },
        },
      },
      { $sort: { statusRank: 1, startDate: 1, createdAt: 1 } },
      {
        $project: {
          tasks: 0,
          doneTasks: 0,
          statusRank: 0,
          completedSort: 0,
          startSnapshot: 0,
          endSnapshot: 0,
          stats: 0,
        },
      },
    ]),
    Task.aggregate([
      // Epics sit above sprints, so they don't count as backlog work
      {
        $match: {
          project: projectId,
          sprint: { $exists: false },
          type: { $ne: "epic" },
        },
      },
      {
        $group: {
          _id: null,
          taskCount: { $sum: 1 },
          doneCount: {
            $sum: {
              $cond: [
                { $eq: ["$statusCategory", StatusCategoryEnum.DONE] },
                1,
                0,
              ],
            },
          },
          pointCount: { $sum: { $ifNull: ["$storyPoints", 0] } },
          donePoints: {
            $sum: {
              $cond: [
                { $eq: ["$statusCategory", StatusCategoryEnum.DONE] },
                { $ifNull: ["$storyPoints", 0] },
                0,
              ],
            },
          },
        },
      },
      { $project: { _id: 0 } },
    ]),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        sprints,
        backlog: backlog[0] ?? {
          taskCount: 0,
          doneCount: 0,
          pointCount: 0,
          donePoints: 0,
        },
      },
      "Sprints fetched",
    ),
  );
});

const createSprint = asyncHandler<ProjectParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const projectId = toObjectId(req.params.projectId, "project id");
  const startDate = parseDueDate(req.body.startDate) ?? undefined;
  const endDate = parseDueDate(req.body.endDate) ?? undefined;
  assertDateOrder(startDate, endDate);

  const name =
    typeof req.body.name === "string" && req.body.name.trim()
      ? req.body.name.trim()
      : `Sprint ${(await Sprint.countDocuments({ project: projectId })) + 1}`;

  const sprint = await Sprint.create({
    project: projectId,
    name,
    goal: req.body.goal,
    startDate,
    endDate,
    createdBy: currentUser._id,
  });

  return res.status(201).json(new ApiResponse(201, sprint, "Sprint created"));
});

const updateSprint = asyncHandler<SprintParams>(async (req, res) => {
  const sprint = await findSprintInProject(
    req.params.projectId,
    req.params.sprintId,
  );
  const { name, goal } = req.body;

  if (typeof name === "string" && name.trim()) sprint.name = name.trim();
  if (goal !== undefined) sprint.goal = goal;

  const startDate = parseDueDate(req.body.startDate);
  const endDate = parseDueDate(req.body.endDate);
  if (startDate !== undefined) sprint.startDate = startDate ?? undefined;
  if (endDate !== undefined) sprint.endDate = endDate ?? undefined;
  assertDateOrder(sprint.startDate, sprint.endDate);

  await sprint.save();
  return res.status(200).json(new ApiResponse(200, sprint, "Sprint updated"));
});

/** Deleting a sprint sends its tasks back to the backlog */
const deleteSprint = asyncHandler<SprintParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const sprint = await findSprintInProject(
    req.params.projectId,
    req.params.sprintId,
  );

  const tasks = await Task.find({ sprint: sprint._id }, "_id").lean();
  const moved = await Task.updateMany(
    { _id: { $in: tasks.map((task) => task._id) }, sprint: sprint._id },
    { $unset: { sprint: 1 } },
  );
  await logActivities(
    sprint.project,
    currentUser._id,
    tasks.map((task) => ({
      task: task._id,
      type: TaskActivityTypeEnum.SPRINT_CHANGED,
      from: { _id: sprint._id, name: sprint.name },
      to: null,
      name: "sprint_deleted",
    })),
  );
  await sprint.deleteOne();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { movedToBacklog: moved.modifiedCount },
        "Sprint deleted",
      ),
    );
});

const startSprint = asyncHandler<SprintParams>(async (req, res) => {
  const sprint = await findSprintInProject(
    req.params.projectId,
    req.params.sprintId,
  );

  if (sprint.status !== SprintStatusEnum.PLANNED) {
    throw new ApiError(400, "Only planned sprints can be started");
  }
  const active = await Sprint.exists({
    project: sprint.project,
    status: SprintStatusEnum.ACTIVE,
  });
  if (active) {
    throw new ApiError(
      409,
      "Another sprint is already active. Complete it before starting a new one.",
    );
  }

  const today = new Date(startOfTodayUtc().getTime() + 12 * 60 * 60 * 1000);
  sprint.startDate =
    parseDueDate(req.body.startDate) ?? sprint.startDate ?? today;
  sprint.endDate =
    parseDueDate(req.body.endDate) ??
    sprint.endDate ??
    new Date(sprint.startDate.getTime() + DEFAULT_SPRINT_DAYS * DAY_MS);
  assertDateOrder(sprint.startDate, sprint.endDate);

  sprint.status = SprintStatusEnum.ACTIVE;
  sprint.startedAt = new Date();
  // What the team committed to, for sprint reports
  const committed = await Task.find(
    { sprint: sprint._id },
    "_id status storyPoints",
  ).lean();
  sprint.startSnapshot = committed.map((task) => ({
    task: task._id,
    status: task.status,
    storyPoints: task.storyPoints,
  }));
  await sprint.save();

  await runSprintAutomations({
    event: "sprint_started",
    sprint: { _id: sprint._id, name: sprint.name },
    taskIds: committed.map((task) => task._id),
    project: sprint.project,
    actor: requireUser(req) as AutomationActor,
  });

  return res.status(200).json(new ApiResponse(200, sprint, "Sprint started"));
});

/**
 * POST .../complete { moveOpenTo: "backlog" | <planned sprint id> }
 * Unfinished tasks move to the backlog or to another sprint.
 */
const completeSprint = asyncHandler<SprintParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const sprint = await findSprintInProject(
    req.params.projectId,
    req.params.sprintId,
  );

  if (sprint.status !== SprintStatusEnum.ACTIVE) {
    throw new ApiError(400, "Only the active sprint can be completed");
  }

  const moveOpenTo: unknown = req.body.moveOpenTo;
  let targetSprintId = undefined;
  let target: { _id: unknown; name: string } | null = null;
  if (moveOpenTo && moveOpenTo !== "backlog") {
    const next = await findSprintInProject(
      req.params.projectId,
      String(moveOpenTo),
    );
    if (
      next.status !== SprintStatusEnum.PLANNED ||
      next._id.equals(sprint._id)
    ) {
      throw new ApiError(400, "Open tasks can only move to a planned sprint");
    }
    targetSprintId = next._id;
    target = { _id: next._id, name: next.name };
  }

  // Freeze the report while unfinished tasks still belong to this sprint.
  // Moves below are logged at or after `completedAt`, so reports ignore them.
  const completedAt = new Date();
  const report = await buildSprintReport(sprint, { asOf: completedAt });
  const [doneCount, openTasks] = await Promise.all([
    Task.countDocuments({
      sprint: sprint._id,
      statusCategory: StatusCategoryEnum.DONE,
    }),
    Task.find(
      { sprint: sprint._id, statusCategory: { $ne: StatusCategoryEnum.DONE } },
      "_id",
    ).lean(),
  ]);

  const sprintTaskIds = (
    await Task.find({ sprint: sprint._id }, "_id").lean()
  ).map((task) => task._id);

  sprint.status = SprintStatusEnum.COMPLETED;
  sprint.completedAt = completedAt;
  sprint.stats = toSprintStats(report);
  await sprint.save();

  const moved = await Task.updateMany(
    { _id: { $in: openTasks.map((task) => task._id) }, sprint: sprint._id },
    targetSprintId
      ? { $set: { sprint: targetSprintId } }
      : { $unset: { sprint: 1 } },
  );
  await logActivities(
    sprint.project,
    currentUser._id,
    openTasks.map((task) => ({
      task: task._id,
      type: TaskActivityTypeEnum.SPRINT_CHANGED,
      from: { _id: sprint._id, name: sprint.name },
      to: target,
      name: "sprint_completed",
    })),
  );

  await runSprintAutomations({
    event: "sprint_completed",
    sprint: { _id: sprint._id, name: sprint.name },
    taskIds: sprintTaskIds,
    project: sprint.project,
    actor: currentUser as AutomationActor,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { sprint, doneCount, movedCount: moved.modifiedCount },
        "Sprint completed",
      ),
    );
});

const MAX_CORRECTION_TASKS = 500;

interface CorrectionEntry {
  task?: unknown;
  done?: unknown;
  storyPoints?: unknown;
}

/**
 * PUT /sprints/:projectId/s/:sprintId/report
 * { committed: [{ task, storyPoints? }], atEnd?: [{ task, done, storyPoints? }] }
 * For sprints from before reports existed: an admin states which tasks were
 * committed at the start and, for completed sprints, which were still in the
 * sprint at the end and whether they were done. The report is then marked
 * confirmed and its stored totals recomputed.
 */
const correctSprintReport = asyncHandler<SprintParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const sprint = await findSprintInProject(
    req.params.projectId,
    req.params.sprintId,
  );
  if (!sprint.reportSource) {
    throw new ApiError(
      400,
      "This sprint's report was recorded as it happened and can't be edited",
    );
  }

  const committedInput: CorrectionEntry[] = Array.isArray(req.body.committed)
    ? req.body.committed
    : [];
  const endInput: CorrectionEntry[] | undefined =
    sprint.completedAt && Array.isArray(req.body.atEnd)
      ? req.body.atEnd
      : undefined;
  if (sprint.completedAt && !endInput) {
    throw new ApiError(
      422,
      "List the tasks that were in the sprint at the end",
    );
  }
  if (
    committedInput.length > MAX_CORRECTION_TASKS ||
    (endInput?.length ?? 0) > MAX_CORRECTION_TASKS
  ) {
    throw new ApiError(422, `At most ${MAX_CORRECTION_TASKS} tasks per list`);
  }

  // Known tasks: current tasks in the project, or ones already in the report
  // (which may have been deleted since)
  const previous = new Map<string, SprintSnapshotEntry>();
  for (const entry of [
    ...(sprint.startSnapshot ?? []),
    ...(sprint.endSnapshot ?? []),
  ]) {
    previous.set(String(entry.task), entry);
  }
  const requestedIds = [...committedInput, ...(endInput ?? [])].map((entry) =>
    toObjectId(entry.task, "task id"),
  );
  const existing = await Task.find(
    { _id: { $in: requestedIds }, project: sprint.project },
    "_id status storyPoints",
  ).lean();
  const taskById = new Map(existing.map((task) => [String(task._id), task]));

  const project = await Project.findById(sprint.project, "statuses").lean();
  const statuses = activeStatuses(project ?? {});
  const categoryOf = categoryLookup(projectStatuses(project ?? {}));
  const firstStatus = (category: "todo" | "done") =>
    statuses.find((status) => status.category === category)?.key ?? category;

  const toEntry = (
    input: CorrectionEntry,
    known: Map<string, SprintSnapshotEntry | undefined>,
    wantDone?: boolean,
  ): SprintSnapshotEntry => {
    const id = String(input.task);
    const task = taskById.get(id);
    const before = known.get(id) ?? previous.get(id);
    if (!task && !before) {
      throw new ApiError(404, "A task in the list isn't part of this project");
    }
    let status = before?.status ?? task?.status ?? firstStatus("todo");
    if (
      wantDone !== undefined &&
      (categoryOf(status) === "done") !== wantDone
    ) {
      status = firstStatus(wantDone ? "done" : "todo");
    }
    const points =
      input.storyPoints === undefined
        ? (before?.storyPoints ?? task?.storyPoints)
        : (parseStoryPoints(input.storyPoints) ?? undefined);
    return {
      task: toObjectId(id, "task id"),
      status,
      ...(points !== undefined && { storyPoints: points }),
    };
  };

  const unique = (entries: CorrectionEntry[]) => {
    const seen = new Set<string>();
    return entries.filter((entry) => {
      const id = String(entry.task);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };

  const startById = new Map(
    (sprint.startSnapshot ?? []).map((entry) => [String(entry.task), entry]),
  );
  const endById = new Map<string, SprintSnapshotEntry | undefined>(
    (sprint.endSnapshot ?? []).map((entry) => [String(entry.task), entry]),
  );
  sprint.startSnapshot = unique(committedInput).map((entry) =>
    toEntry(entry, startById),
  );
  if (endInput) {
    sprint.endSnapshot = unique(endInput).map((entry) =>
      toEntry(entry, endById, entry.done === true),
    );
  }
  sprint.reportSource = "confirmed";
  sprint.reportConfirmedAt = new Date();
  sprint.reportConfirmedBy = currentUser._id;
  if (sprint.completedAt) {
    sprint.stats = toSprintStats(await buildSprintReport(sprint));
  }
  await sprint.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { _id: sprint._id }, "Sprint report confirmed"));
});

export {
  correctSprintReport,
  completeSprint,
  createSprint,
  deleteSprint,
  getSprints,
  startSprint,
  updateSprint,
};
