import type { Types } from "mongoose";
import { DueReminder } from "../models/duereminder.models.js";
import { NotificationTypeEnum } from "../models/notification.models.js";
import { Project } from "../models/project.models.js";
import { Task } from "../models/task.models.js";
import { User } from "../models/user.models.js";
import { StatusCategoryEnum } from "./constants.js";
import { notify } from "./notifications.js";
import { dayKey, isValidTimeZone } from "./sprint-report.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Overdue reminders only for recently missed dates, not years-old tasks */
const OVERDUE_LOOKBACK_DAYS = 3;
/** Upper bound per run so one run can't stall the server */
const MAX_REMINDERS_PER_RUN = 2000;

export const DEFAULT_TIME_ZONE = "UTC";

/** Due dates are stored at 12:00 UTC, so the calendar day is the ISO prefix */
const dueDateOf = (key: string) => new Date(`${key}T00:00:00.000Z`);
const dueKeyOf = (dueDate: Date) => dueDate.toISOString().slice(0, 10);
const shiftDay = (key: string, days: number) =>
  dueKeyOf(new Date(dueDateOf(key).getTime() + days * DAY_MS));

interface RemindableTask {
  _id: Types.ObjectId;
  key: string;
  title: string;
  project: Types.ObjectId;
  dueDate?: Date;
  watchers?: Types.ObjectId[];
}

/**
 * Reminds watchers about tasks that are due or overdue *in their own time
 * zone*: someone in Kolkata hears about a task on their 17th, someone in
 * Los Angeles on theirs. People without a stored time zone are treated as UTC.
 */
export const sendDueReminders = async () => {
  const projectNames = new Map<string, string>();
  const projectSummary = async (projectId: Types.ObjectId) => {
    const key = String(projectId);
    if (!projectNames.has(key)) {
      const project = await Project.findById(projectId, "name").lean();
      projectNames.set(key, project?.name ?? "a project");
    }
    return { _id: projectId, name: projectNames.get(key)! };
  };

  const zones = [
    ...new Set([
      DEFAULT_TIME_ZONE,
      ...(await User.distinct("timeZone")).filter(isValidTimeZone),
    ]),
  ];
  const notDone = { statusCategory: { $ne: StatusCategoryEnum.DONE } };
  let sent = 0;

  /** Sends one reminder per watcher who lives in `timeZone` and hasn't had it */
  const remind = async (
    tasks: RemindableTask[],
    timeZone: string,
    kind: "due_soon" | "overdue",
  ) => {
    const type =
      kind === "due_soon"
        ? NotificationTypeEnum.TASK_DUE_SOON
        : NotificationTypeEnum.TASK_OVERDUE;

    for (const task of tasks) {
      const watchers = task.watchers ?? [];
      if (watchers.length === 0 || sent >= MAX_REMINDERS_PER_RUN) continue;

      const here = await User.find(
        {
          _id: { $in: watchers },
          // UTC is the catch-all: nobody is skipped over a missing or
          // unrecognised zone
          ...(timeZone === DEFAULT_TIME_ZONE
            ? { timeZone: { $nin: zones.filter((z) => z !== timeZone) } }
            : { timeZone }),
        },
        "_id",
      ).lean();
      if (here.length === 0) continue;

      const dueKey = task.dueDate ? dueKeyOf(task.dueDate) : "";
      for (const user of here) {
        try {
          // The insert is the claim; a duplicate means it already went out
          await DueReminder.create({
            task: task._id,
            user: user._id,
            kind,
            dueKey,
          });
        } catch {
          continue;
        }
        sent += 1;
        await notify({
          type,
          recipients: [user._id],
          project: await projectSummary(task.project),
          task,
        });
      }
    }
  };

  const fields = "_id key title project dueDate watchers";
  for (const timeZone of zones) {
    const todayKey = dayKey(Date.now(), timeZone);
    const [dueToday, overdue] = await Promise.all([
      Task.find(
        {
          ...notDone,
          dueDate: {
            $gte: dueDateOf(todayKey),
            $lt: dueDateOf(shiftDay(todayKey, 1)),
          },
        },
        fields,
      ).lean(),
      Task.find(
        {
          ...notDone,
          dueDate: {
            $gte: dueDateOf(shiftDay(todayKey, -OVERDUE_LOOKBACK_DAYS)),
            $lt: dueDateOf(todayKey),
          },
        },
        fields,
      ).lean(),
    ]);
    await remind(dueToday, timeZone, "due_soon");
    await remind(overdue, timeZone, "overdue");
  }
  return sent;
};

/** Checks due dates now and then every hour */
export const startDueReminders = () => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const sent = await sendDueReminders();
      if (sent > 0) console.log(`🔔 Sent ${sent} due date reminders`);
    } catch (error) {
      console.error("Due date reminders failed:", error);
    } finally {
      running = false;
    }
  };
  void run();
  setInterval(run, HOUR_MS).unref();
};
