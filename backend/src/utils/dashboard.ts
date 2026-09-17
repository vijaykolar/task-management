import type { Types } from "mongoose";
import { Project } from "../models/project.models.js";
import {
  TaskActivity,
  TaskActivityTypeEnum,
} from "../models/taskactivity.models.js";
import { Task } from "../models/task.models.js";
import { User } from "../models/user.models.js";
import {
  StatusCategoryEnum,
  TaskTypeEnum,
  type TaskType,
} from "./constants.js";
import { dayKey, startOfDay } from "./sprint-report.js";
import { categoryLookup, projectStatuses } from "./workflow.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EPICS = 20;

export interface ProjectDashboard {
  range: { days: number; from: string; to: string; timeZone: string };
  totals: {
    open: number;
    inProgress: number;
    overdue: number;
    unassigned: number;
    /** Created and resolved within the range */
    created: number;
    resolved: number;
  };
  createdVsResolved: { date: string; created: number; resolved: number }[];
  workload: {
    /** null = unassigned */
    user: {
      _id: Types.ObjectId;
      username: string;
      fullName?: string;
      avatar?: { url: string };
    } | null;
    todo: number;
    inProgress: number;
    points: number;
  }[];
  statuses: { key: string; name: string; category: string; count: number }[];
  epics: {
    _id: Types.ObjectId;
    key: string;
    title: string;
    statusCategory: string;
    total: number;
    done: number;
    points: number;
    donePoints: number;
  }[];
}

/** `YYYY-MM-DD` `offset` days before `key` */
const shiftDay = (key: string, offset: number) =>
  new Date(Date.parse(`${key}T00:00:00.000Z`) - offset * DAY_MS)
    .toISOString()
    .slice(0, 10);

/**
 * Project-wide numbers for the Overview dashboard. `type` narrows everything
 * except epic progress to one issue type; by default epics are left out,
 * since they group work rather than being work.
 */
export const buildProjectDashboard = async (
  projectId: Types.ObjectId,
  { days, timeZone, type }: { days: number; timeZone: string; type?: TaskType },
): Promise<ProjectDashboard> => {
  const project = await Project.findById(projectId, "statuses").lean();
  const statuses = projectStatuses(project ?? {});
  const categoryOf = categoryLookup(statuses);
  const typeMatch = type ?? { $ne: TaskTypeEnum.EPIC };
  const isCounted = (taskType: TaskType | undefined) =>
    type ? taskType === type : taskType !== TaskTypeEnum.EPIC;

  const toKey = dayKey(Date.now(), timeZone);
  const fromKey = shiftDay(toKey, days - 1);
  const rangeStart = new Date(startOfDay(fromKey, timeZone));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [events, openTasks, statusCounts, epics] = await Promise.all([
    // Creation and status changes in the range; deleted tasks still count
    TaskActivity.find(
      {
        project: projectId,
        createdAt: { $gte: rangeStart },
        type: {
          $in: [
            TaskActivityTypeEnum.CREATED,
            TaskActivityTypeEnum.STATUS_CHANGED,
          ],
        },
      },
      "task type from to createdAt",
    ).lean(),
    Task.aggregate<{
      _id: Types.ObjectId | null;
      todo: number;
      inProgress: number;
      points: number;
      overdue: number;
    }>([
      {
        $match: {
          project: projectId,
          type: typeMatch,
          statusCategory: { $ne: StatusCategoryEnum.DONE },
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$assignedTo", null] },
          todo: {
            $sum: {
              $cond: [
                { $eq: ["$statusCategory", StatusCategoryEnum.IN_PROGRESS] },
                0,
                1,
              ],
            },
          },
          inProgress: {
            $sum: {
              $cond: [
                { $eq: ["$statusCategory", StatusCategoryEnum.IN_PROGRESS] },
                1,
                0,
              ],
            },
          },
          points: { $sum: { $ifNull: ["$storyPoints", 0] } },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: [{ $type: "$dueDate" }, "missing"] },
                    { $lt: ["$dueDate", today] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    Task.aggregate<{ _id: string; count: number }>([
      { $match: { project: projectId, type: typeMatch } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: { project: projectId, type: TaskTypeEnum.EPIC } },
      {
        $lookup: {
          from: "tasks",
          localField: "_id",
          foreignField: "epic",
          as: "children",
          pipeline: [{ $project: { statusCategory: 1, storyPoints: 1 } }],
        },
      },
      {
        $addFields: {
          doneChildren: {
            $filter: {
              input: "$children",
              cond: {
                $eq: ["$$this.statusCategory", StatusCategoryEnum.DONE],
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          key: 1,
          title: 1,
          number: 1,
          statusCategory: 1,
          total: { $size: "$children" },
          done: { $size: "$doneChildren" },
          points: {
            $sum: {
              $map: {
                input: "$children",
                in: { $ifNull: ["$$this.storyPoints", 0] },
              },
            },
          },
          donePoints: {
            $sum: {
              $map: {
                input: "$doneChildren",
                in: { $ifNull: ["$$this.storyPoints", 0] },
              },
            },
          },
          isDone: {
            $eq: ["$statusCategory", StatusCategoryEnum.DONE],
          },
        },
      },
      // Unfinished epics first, then in ticket order
      { $sort: { isDone: 1, number: 1 } },
      { $limit: MAX_EPICS },
      { $project: { isDone: 0, number: 0 } },
    ]),
  ]);

  // ---------- Created vs resolved ----------
  const taskIds = [...new Set(events.map((event) => String(event.task)))];
  const [tasks, deletions] = await Promise.all([
    Task.find({ _id: { $in: taskIds } }, "type").lean(),
    // Deleted tasks' types come from their deletion record
    TaskActivity.find(
      {
        task: { $in: taskIds },
        type: TaskActivityTypeEnum.DELETED,
      },
      "task from",
    ).lean(),
  ]);
  const typeById = new Map<string, TaskType | undefined>(
    tasks.map((task) => [String(task._id), task.type]),
  );
  for (const deletion of deletions) {
    const key = String(deletion.task);
    if (!typeById.has(key)) {
      const snapshot = deletion.from as { type?: TaskType } | undefined;
      // Tasks deleted before types were recorded count as plain tasks
      typeById.set(key, snapshot?.type ?? TaskTypeEnum.TASK);
    }
  }

  const series = new Map<string, { created: number; resolved: number }>();
  for (let offset = days - 1; offset >= 0; offset--) {
    series.set(shiftDay(toKey, offset), { created: 0, resolved: 0 });
  }
  const isDone = (status: unknown) =>
    categoryOf(status) === StatusCategoryEnum.DONE;

  for (const event of events) {
    if (!isCounted(typeById.get(String(event.task)))) continue;
    const bucket = series.get(dayKey(event.createdAt, timeZone));
    if (!bucket) continue;
    if (event.type === TaskActivityTypeEnum.CREATED) {
      bucket.created += 1;
      // Created straight into a Done status
      if (isDone(event.to)) bucket.resolved += 1;
    } else if (isDone(event.to) && !isDone(event.from)) {
      bucket.resolved += 1;
    }
  }
  const createdVsResolved = [...series].map(([date, counts]) => ({
    date,
    ...counts,
  }));

  // ---------- Workload ----------
  const userIds = openTasks
    .map((row) => row._id)
    .filter((id): id is Types.ObjectId => !!id);
  const users = await User.find(
    { _id: { $in: userIds } },
    "username fullName avatar.url",
  ).lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));

  const workload = openTasks
    .map((row) => ({
      user: (row._id && userById.get(String(row._id))) || null,
      todo: row.todo,
      inProgress: row.inProgress,
      points: Math.round(row.points * 10) / 10,
    }))
    // Busiest people first; unassigned work last
    .sort(
      (a, b) =>
        Number(a.user === null) - Number(b.user === null) ||
        b.todo + b.inProgress - (a.todo + a.inProgress),
    );

  // ---------- Statuses ----------
  const countByStatus = new Map(
    statusCounts.map((row) => [row._id, row.count]),
  );
  const statusRows = statuses
    .filter((status) => !status.archived || countByStatus.get(status.key))
    .map((status) => ({
      key: status.key,
      name: status.name,
      category: status.category,
      count: countByStatus.get(status.key) ?? 0,
    }));

  const sum = (pick: (row: (typeof openTasks)[number]) => number) =>
    openTasks.reduce((total, row) => total + pick(row), 0);

  return {
    range: { days, from: fromKey, to: toKey, timeZone },
    totals: {
      open: sum((row) => row.todo + row.inProgress),
      inProgress: sum((row) => row.inProgress),
      overdue: sum((row) => row.overdue),
      unassigned: sum((row) =>
        row._id === null ? row.todo + row.inProgress : 0,
      ),
      created: createdVsResolved.reduce((total, day) => total + day.created, 0),
      resolved: createdVsResolved.reduce(
        (total, day) => total + day.resolved,
        0,
      ),
    },
    createdVsResolved,
    workload,
    statuses: statusRows,
    epics: epics.map((epic) => ({
      ...epic,
      points: Math.round(epic.points * 10) / 10,
      donePoints: Math.round(epic.donePoints * 10) / 10,
    })),
  };
};
