import { Sprint, SprintStatusEnum } from "../models/sprint.models.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { AvailableTaskTypes, type TaskType } from "../utils/constants.js";
import { buildProjectDashboard } from "../utils/dashboard.js";
import { toObjectId } from "../utils/object-id.js";
import { buildSprintReport, toSprintStats } from "../utils/sprint-report.js";
import { findSprintInProject } from "../utils/sprints.js";

type ProjectParams = { projectId: string };
type SprintParams = ProjectParams & { sprintId: string };

const DEFAULT_VELOCITY_SPRINTS = 7;

/** GET /reports/:projectId/sprints/:sprintId?tz — burndown, burnup, summary */
const getSprintReport = asyncHandler<SprintParams>(async (req, res) => {
  const sprint = await findSprintInProject(
    req.params.projectId,
    req.params.sprintId,
  );
  if (sprint.status === SprintStatusEnum.PLANNED) {
    throw new ApiError(400, "Reports are available once a sprint starts");
  }

  const timeZone = typeof req.query.tz === "string" ? req.query.tz : "UTC";
  const report = await buildSprintReport(sprint, { timeZone });

  return res
    .status(200)
    .json(new ApiResponse(200, report, "Sprint report fetched"));
});

/**
 * GET /reports/:projectId/velocity?limit — committed vs completed for the most
 * recent completed sprints, oldest first
 */
const getVelocity = asyncHandler<ProjectParams>(async (req, res) => {
  const projectId = toObjectId(req.params.projectId, "project id");
  const limit = Number(req.query.limit) || DEFAULT_VELOCITY_SPRINTS;

  const sprints = await Sprint.find({
    project: projectId,
    status: SprintStatusEnum.COMPLETED,
  })
    .sort({ completedAt: -1, _id: -1 })
    .limit(limit);

  const rows = await Promise.all(
    sprints.reverse().map(async (sprint) => {
      // Sprints completed before stats existed are rebuilt from history
      const stats = sprint.stats ?? {
        ...toSprintStats(await buildSprintReport(sprint)),
        approximate: true,
      };
      return {
        _id: sprint._id,
        name: sprint.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        completedAt: sprint.completedAt,
        committed: stats.committed,
        completed: stats.completed,
        approximate: stats.approximate,
      };
    }),
  );

  const average = rows.length
    ? {
        count:
          Math.round(
            (rows.reduce((sum, row) => sum + row.completed.count, 0) /
              rows.length) *
              10,
          ) / 10,
        points:
          Math.round(
            (rows.reduce((sum, row) => sum + row.completed.points, 0) /
              rows.length) *
              10,
          ) / 10,
      }
    : { count: 0, points: 0 };

  return res
    .status(200)
    .json(new ApiResponse(200, { sprints: rows, average }, "Velocity fetched"));
});

const DEFAULT_DASHBOARD_DAYS = 30;

/**
 * GET /reports/:projectId/dashboard?days=7..90&tz&type — created vs resolved,
 * workload, issues by status and epic progress
 */
const getProjectDashboard = asyncHandler<ProjectParams>(async (req, res) => {
  const type = AvailableTaskTypes.includes(req.query.type as TaskType)
    ? (req.query.type as TaskType)
    : undefined;
  const dashboard = await buildProjectDashboard(
    toObjectId(req.params.projectId, "project id"),
    {
      days: Number(req.query.days) || DEFAULT_DASHBOARD_DAYS,
      timeZone: typeof req.query.tz === "string" ? req.query.tz : "UTC",
      type,
    },
  );
  return res
    .status(200)
    .json(new ApiResponse(200, dashboard, "Dashboard fetched"));
});

export { getProjectDashboard, getSprintReport, getVelocity };
