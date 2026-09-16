import { Sprint, SprintStatusEnum } from "../models/sprint.models.js";
import { Task } from "../models/task.models.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { TaskStatusEnum } from "../utils/constants.js";
import { toObjectId } from "../utils/object-id.js";
import { requireUser } from "../utils/request-user.js";
import { parseDueDate, startOfTodayUtc } from "../utils/task-fields.js";

type ProjectParams = { projectId: string };
type SprintParams = ProjectParams & { sprintId: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SPRINT_DAYS = 14;

const findSprintInProject = async (projectId: string, sprintId: string) => {
  const sprint = await Sprint.findOne({
    _id: toObjectId(sprintId, "sprint id"),
    project: toObjectId(projectId, "project id"),
  });
  if (!sprint) {
    throw new ApiError(404, "Sprint not found");
  }
  return sprint;
};

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
          pipeline: [{ $project: { status: 1 } }],
        },
      },
      {
        $addFields: {
          taskCount: { $size: "$tasks" },
          doneCount: {
            $size: {
              $filter: {
                input: "$tasks",
                cond: { $eq: ["$$this.status", TaskStatusEnum.DONE] },
              },
            },
          },
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
      { $project: { tasks: 0, statusRank: 0, completedSort: 0 } },
    ]),
    Task.aggregate([
      { $match: { project: projectId, sprint: { $exists: false } } },
      {
        $group: {
          _id: null,
          taskCount: { $sum: 1 },
          doneCount: {
            $sum: {
              $cond: [{ $eq: ["$status", TaskStatusEnum.DONE] }, 1, 0],
            },
          },
        },
      },
      { $project: { _id: 0 } },
    ]),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { sprints, backlog: backlog[0] ?? { taskCount: 0, doneCount: 0 } },
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
  const sprint = await findSprintInProject(
    req.params.projectId,
    req.params.sprintId,
  );

  const moved = await Task.updateMany(
    { sprint: sprint._id },
    { $unset: { sprint: 1 } },
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
  await sprint.save();

  return res.status(200).json(new ApiResponse(200, sprint, "Sprint started"));
});

/**
 * POST .../complete { moveOpenTo: "backlog" | <planned sprint id> }
 * Unfinished tasks move to the backlog or to another sprint.
 */
const completeSprint = asyncHandler<SprintParams>(async (req, res) => {
  const sprint = await findSprintInProject(
    req.params.projectId,
    req.params.sprintId,
  );

  if (sprint.status !== SprintStatusEnum.ACTIVE) {
    throw new ApiError(400, "Only the active sprint can be completed");
  }

  const target: unknown = req.body.moveOpenTo;
  let targetSprintId = undefined;
  if (target && target !== "backlog") {
    const next = await findSprintInProject(
      req.params.projectId,
      String(target),
    );
    if (
      next.status !== SprintStatusEnum.PLANNED ||
      next._id.equals(sprint._id)
    ) {
      throw new ApiError(400, "Open tasks can only move to a planned sprint");
    }
    targetSprintId = next._id;
  }

  const openFilter = {
    sprint: sprint._id,
    status: { $ne: TaskStatusEnum.DONE },
  };
  const [doneCount, moved] = await Promise.all([
    Task.countDocuments({ sprint: sprint._id, status: TaskStatusEnum.DONE }),
    Task.updateMany(
      openFilter,
      targetSprintId
        ? { $set: { sprint: targetSprintId } }
        : { $unset: { sprint: 1 } },
    ),
  ]);

  sprint.status = SprintStatusEnum.COMPLETED;
  sprint.completedAt = new Date();
  await sprint.save();

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

export {
  completeSprint,
  createSprint,
  deleteSprint,
  getSprints,
  startSprint,
  updateSprint,
};
