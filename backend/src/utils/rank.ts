import type { Types } from "mongoose";
import { Task } from "../models/task.models.js";
import { TaskTypeEnum } from "./constants.js";

export const RANK_STEP = 1000;
/** Below this gap, neighbours are renumbered before inserting between them */
const MIN_RANK_GAP = 1e-6;

/** Rank that puts a new task at the bottom of the project */
export const nextRank = async (projectId: Types.ObjectId) => {
  const last = await Task.findOne({ project: projectId }, "rank")
    .sort({ rank: -1 })
    .lean();
  return (last?.rank ?? 0) + RANK_STEP;
};

/** Renumbers a project's ranks in their current order, RANK_STEP apart */
const rebalance = async (projectId: Types.ObjectId) => {
  const tasks = await Task.find({ project: projectId }, "_id")
    .sort({ rank: 1, _id: 1 })
    .lean();
  await Task.bulkWrite(
    tasks.map((task, index) => ({
      updateOne: {
        filter: { _id: task._id },
        update: { $set: { rank: (index + 1) * RANK_STEP } },
      },
    })),
  );
};

interface Placement {
  projectId: Types.ObjectId;
  taskId: Types.ObjectId;
  /** Sprint the task ends up in; undefined = backlog */
  sprint?: Types.ObjectId;
  /** Put the task right after this one… */
  after?: { _id: Types.ObjectId; rank: number };
  /** …or right before this one (ignored when `after` is given) */
  before?: { _id: Types.ObjectId; rank: number };
}

/**
 * Rank for a task placed next to `after`/`before` within a sprint or the
 * backlog. The other neighbour is looked up here, so tasks the client hasn't
 * loaded yet keep their place.
 */
export const rankBetween = async (
  placement: Placement,
  retried = false,
): Promise<number> => {
  const { projectId, taskId, sprint, after, before } = placement;
  // Same list the backlog shows: this sprint (or the backlog), without epics
  const scope = {
    project: projectId,
    _id: { $ne: taskId },
    sprint: sprint ?? { $exists: false },
    type: { $ne: TaskTypeEnum.EPIC },
  };

  let lower: number | undefined;
  let upper: number | undefined;
  if (after) {
    lower = after.rank;
    upper = (
      await Task.findOne({ ...scope, rank: { $gt: after.rank } }, "rank")
        .sort({ rank: 1 })
        .lean()
    )?.rank;
  } else if (before) {
    upper = before.rank;
    lower = (
      await Task.findOne({ ...scope, rank: { $lt: before.rank } }, "rank")
        .sort({ rank: -1 })
        .lean()
    )?.rank;
  } else {
    // Top of the list
    upper = (await Task.findOne(scope, "rank").sort({ rank: 1 }).lean())?.rank;
  }

  if (lower === undefined && upper === undefined) return nextRank(projectId);
  if (lower === undefined) return upper! - RANK_STEP;
  if (upper === undefined) return lower + RANK_STEP;
  if (upper - lower > MIN_RANK_GAP || retried) return (lower + upper) / 2;

  // Out of room between the two: spread everything out, then try again
  await rebalance(projectId);
  const [freshAfter, freshBefore] = await Promise.all([
    after && Task.findById(after._id, "rank").lean(),
    before && Task.findById(before._id, "rank").lean(),
  ]);
  return rankBetween(
    {
      ...placement,
      after: freshAfter ?? undefined,
      before: freshBefore ?? undefined,
    },
    true,
  );
};
