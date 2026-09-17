import type { Types } from "mongoose";
import {
  AutomationActionEnum,
  AutomationEventEnum,
  AutomationOperatorEnum,
  AutomationRule,
  type AutomationEvent,
  type AutomationField,
  type IAutomationAction,
  type IAutomationCondition,
  type IAutomationRule,
} from "../models/automationrule.models.js";
import { AutomationRun } from "../models/automationrun.models.js";
import { NotificationTypeEnum } from "../models/notification.models.js";
import { Project, type IProjectStatus } from "../models/project.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import { Sprint, SprintStatusEnum } from "../models/sprint.models.js";
import { Task, type TaskDocument } from "../models/task.models.js";
import { TaskActivityTypeEnum } from "../models/taskactivity.models.js";
import { TaskComment } from "../models/taskcomment.models.js";
import { logActivity, type ActivityEntry } from "./activity.js";
import {
  AvailableTaskTypes,
  StatusCategoryEnum,
  TaskTypeEnum,
  type StatusCategory,
  type TaskType,
} from "./constants.js";
import { notify } from "./notifications.js";
import { nextRank } from "./rank.js";
import { prepareRichText } from "./rich-text.js";
import { dayKey, isValidTimeZone, startOfDay } from "./sprint-report.js";
import { addWatchers, watchersOf } from "./watchers.js";
import { projectStatuses, reserveTaskNumber } from "./workflow.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** How many rules deep a chain of automation may go before it is cut off */
const MAX_DEPTH = 3;
/** Ceiling for a rule that sweeps tasks (sprint and scheduled rules) */
const MAX_TASKS_PER_RUN = 200;
const DEFAULT_TIME_ZONE = "UTC";

export interface AutomationActor {
  _id: Types.ObjectId;
  username: string;
  fullName?: string;
}

/** A field that changed, as the trigger matcher sees it */
export interface FieldChange {
  field: AutomationField;
  from?: string;
  to?: string;
}

interface ProjectContext {
  _id: Types.ObjectId;
  name: string;
  statuses?: IProjectStatus[] | null;
}

/**
 * Carried through a chain of rules so automation can't loop: each rule runs at
 * most once per chain, and chains stop at `MAX_DEPTH`.
 */
interface Chain {
  depth: number;
  ran: Set<string>;
}

const newChain = (): Chain => ({ depth: 0, ran: new Set() });

// ---------- Matching ----------

const matchesTrigger = (
  rule: IAutomationRule,
  event: AutomationEvent,
  changes: FieldChange[],
  statuses: IProjectStatus[],
) => {
  if (rule.trigger.event !== event) return false;
  if (event !== AutomationEventEnum.TASK_CHANGED) return true;

  const field = rule.trigger.field;
  // No field named means "any change"
  const matching = field
    ? changes.filter((change) => change.field === field)
    : changes;
  if (matching.length === 0) return false;

  const { to, from } = rule.trigger;
  if (!to && !from) return true;

  // On status, "to" may name a status or a whole category ("done")
  const category = (key?: string) =>
    statuses.find((status) => status.key === key)?.category;
  const sameValue = (actual: string | undefined, wanted: string) =>
    actual === wanted ||
    (field === "status" && category(actual) === wanted) ||
    // Legacy statuses use the category as their key
    (field === "status" && actual === wanted);

  return matching.some(
    (change) =>
      (!to || sameValue(change.to, to)) &&
      (!from || sameValue(change.from, from)),
  );
};

/** The value a condition tests, as a string (or a list, for labels) */
const conditionValue = (
  task: TaskDocument,
  field: IAutomationCondition["field"],
): string | string[] | number | undefined => {
  switch (field) {
    case "type":
      return task.type;
    case "status":
      return task.status;
    case "statusCategory":
      return task.statusCategory;
    case "priority":
      return task.priority;
    case "assignee":
      return task.assignedTo ? String(task.assignedTo) : "";
    case "labels":
      return task.labels ?? [];
    case "sprint":
      return task.sprint ? String(task.sprint) : "";
    case "storyPoints":
      return task.storyPoints;
    case "epic":
      return task.epic ? String(task.epic) : "";
    case "dueDate":
      return task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "";
    default:
      return undefined;
  }
};

const isEmpty = (value: string | string[] | number | undefined) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

const holds = (condition: IAutomationCondition, task: TaskDocument) => {
  const actual = conditionValue(task, condition.field);
  const wanted = condition.value ?? "";
  const text = Array.isArray(actual) ? actual.join(" ") : String(actual ?? "");

  switch (condition.op) {
    case AutomationOperatorEnum.IS:
      return Array.isArray(actual)
        ? actual.includes(wanted)
        : String(actual ?? "") === wanted;
    case AutomationOperatorEnum.IS_NOT:
      return Array.isArray(actual)
        ? !actual.includes(wanted)
        : String(actual ?? "") !== wanted;
    case AutomationOperatorEnum.CONTAINS:
      return Array.isArray(actual)
        ? actual.includes(wanted)
        : text.toLowerCase().includes(wanted.toLowerCase());
    case AutomationOperatorEnum.NOT_CONTAINS:
      return Array.isArray(actual)
        ? !actual.includes(wanted)
        : !text.toLowerCase().includes(wanted.toLowerCase());
    case AutomationOperatorEnum.IS_EMPTY:
      return isEmpty(actual);
    case AutomationOperatorEnum.IS_NOT_EMPTY:
      return !isEmpty(actual);
    case AutomationOperatorEnum.GT:
      return Number(actual) > Number(wanted);
    case AutomationOperatorEnum.LT:
      return Number(actual) < Number(wanted);
    default:
      return false;
  }
};

/** Index of the first condition that fails, or -1 when they all hold */
const firstFailing = (conditions: IAutomationCondition[], task: TaskDocument) =>
  conditions.findIndex((condition) => !holds(condition, task));

// ---------- Actions ----------

interface ActionResult {
  /** What happened, for the run log; undefined when nothing changed */
  detail?: string;
  /** The field this changed, so the chain can re-trigger on it */
  change?: FieldChange;
}

const statusName = (statuses: IProjectStatus[], key: string) =>
  statuses.find((status) => status.key === key)?.name ?? key;

const resolveSprintValue = async (
  projectId: Types.ObjectId,
  value: string | undefined,
) => {
  if (!value || value === "backlog") return null;
  if (value === "active") {
    return Sprint.findOne({
      project: projectId,
      status: SprintStatusEnum.ACTIVE,
    }).lean();
  }
  if (value === "next") {
    return Sprint.findOne({
      project: projectId,
      status: SprintStatusEnum.PLANNED,
    })
      .sort({ startDate: 1, createdAt: 1 })
      .lean();
  }
  return Sprint.findOne({ _id: value, project: projectId }).lean();
};

const resolveUserValue = async (
  projectId: Types.ObjectId,
  value: string | undefined,
  actor: AutomationActor | undefined,
): Promise<Types.ObjectId | undefined> => {
  if (!value || value === "unassigned") return undefined;
  const id = value === "actor" ? actor?._id : value;
  if (!id) return undefined;
  const member = await ProjectMember.findOne(
    { project: projectId, user: id },
    "user",
  ).lean();
  return member?.user;
};

/**
 * Applies one action to a task. Mutates the document; the caller saves it once
 * all the actions have run.
 */
const applyAction = async (
  action: IAutomationAction,
  task: TaskDocument,
  project: ProjectContext,
  actor: AutomationActor | undefined,
  history: ActivityEntry[],
): Promise<ActionResult> => {
  const statuses = projectStatuses(project);

  switch (action.type) {
    case AutomationActionEnum.SET_STATUS: {
      const status = statuses.find(
        (candidate) => candidate.key === action.value,
      );
      if (!status || status.key === task.status) return {};
      const from = task.status;
      history.push({
        type: TaskActivityTypeEnum.STATUS_CHANGED,
        from,
        to: status.key,
        name: "automation",
      });
      task.status = status.key;
      task.statusCategory = status.category;
      return {
        detail: `Set status to ${status.name}`,
        change: { field: "status", from, to: status.key },
      };
    }

    case AutomationActionEnum.SET_ASSIGNEE: {
      const next = await resolveUserValue(project._id, action.value, actor);
      const from = task.assignedTo ? String(task.assignedTo) : undefined;
      if (String(next ?? "") === String(task.assignedTo ?? "")) return {};
      history.push({
        type: TaskActivityTypeEnum.ASSIGNEE_CHANGED,
        from: from ?? null,
        to: next ? String(next) : null,
        name: "automation",
      });
      task.assignedTo = next;
      return {
        detail: next ? "Reassigned" : "Unassigned",
        change: {
          field: "assignee",
          from,
          to: next ? String(next) : undefined,
        },
      };
    }

    case AutomationActionEnum.SET_PRIORITY: {
      if (!action.value || action.value === task.priority) return {};
      const from = task.priority;
      history.push({
        type: TaskActivityTypeEnum.PRIORITY_CHANGED,
        from,
        to: action.value,
        name: "automation",
      });
      task.priority = action.value as TaskDocument["priority"];
      return {
        detail: `Set priority to ${action.value}`,
        change: { field: "priority", from, to: action.value },
      };
    }

    case AutomationActionEnum.SET_SPRINT: {
      const sprint = await resolveSprintValue(project._id, action.value);
      const from = task.sprint ? String(task.sprint) : undefined;
      if (String(sprint?._id ?? "") === String(task.sprint ?? "")) return {};
      if (task.type === TaskTypeEnum.EPIC && sprint) return {};
      history.push({
        type: TaskActivityTypeEnum.SPRINT_CHANGED,
        from: from ?? null,
        to: sprint ? { _id: sprint._id, name: sprint.name } : null,
        name: "automation",
      });
      task.sprint = sprint?._id;
      return {
        detail: sprint ? `Moved to ${sprint.name}` : "Moved to the backlog",
        change: {
          field: "sprint",
          from,
          to: sprint ? String(sprint._id) : undefined,
        },
      };
    }

    case AutomationActionEnum.SET_DUE_DATE: {
      const from = task.dueDate?.toISOString().slice(0, 10);
      if (action.days === undefined || action.days === null) {
        if (!task.dueDate) return {};
        history.push({
          type: TaskActivityTypeEnum.DUE_DATE_CHANGED,
          from: from ?? null,
          to: null,
          name: "automation",
        });
        task.dueDate = undefined;
        return {
          detail: "Cleared the due date",
          change: { field: "dueDate", from },
        };
      }
      // Stored at 12:00 UTC, like every other due date
      const key = new Date(Date.now() + action.days * DAY_MS)
        .toISOString()
        .slice(0, 10);
      if (key === from) return {};
      history.push({
        type: TaskActivityTypeEnum.DUE_DATE_CHANGED,
        from: from ?? null,
        to: key,
        name: "automation",
      });
      task.dueDate = new Date(`${key}T12:00:00.000Z`);
      return {
        detail: `Set the due date to ${key}`,
        change: { field: "dueDate", from, to: key },
      };
    }

    case AutomationActionEnum.ADD_LABELS: {
      const adding = (action.labels ?? []).filter(
        (label) => !task.labels.includes(label),
      );
      if (adding.length === 0) return {};
      const from = [...task.labels];
      task.labels = [...task.labels, ...adding];
      history.push({
        type: TaskActivityTypeEnum.LABELS_CHANGED,
        from,
        to: [...task.labels],
        name: "automation",
      });
      return {
        detail: `Added ${adding.join(", ")}`,
        change: { field: "labels", to: task.labels.join(",") },
      };
    }

    case AutomationActionEnum.REMOVE_LABELS: {
      const removing = action.labels ?? [];
      const kept = task.labels.filter((label) => !removing.includes(label));
      if (kept.length === task.labels.length) return {};
      const from = [...task.labels];
      task.labels = kept;
      history.push({
        type: TaskActivityTypeEnum.LABELS_CHANGED,
        from,
        to: kept,
        name: "automation",
      });
      return {
        detail: `Removed ${removing.join(", ")}`,
        change: { field: "labels", to: kept.join(",") },
      };
    }

    case AutomationActionEnum.ADD_COMMENT: {
      const text = action.text?.trim();
      if (!text) return {};
      const rich = prepareRichText(`<p>${escapeHtml(text)}</p>`);
      await TaskComment.create({
        task: task._id,
        project: project._id,
        author: actor?._id ?? task.assignedTo ?? task.watchers[0],
        body: rich.html,
        bodyText: rich.text,
      });
      history.push({
        type: TaskActivityTypeEnum.COMMENT_ADDED,
        name: "automation",
      });
      return { detail: "Commented" };
    }

    case AutomationActionEnum.NOTIFY: {
      const recipients = await notifyRecipients(task, action.value);
      if (recipients.length === 0) return {};
      await notify({
        type: NotificationTypeEnum.AUTOMATION,
        recipients,
        project: { _id: project._id, name: project.name },
        task,
        excerpt: action.text?.trim() || undefined,
      });
      return { detail: `Notified ${recipients.length}` };
    }

    default:
      return {};
  }
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const notifyRecipients = async (task: TaskDocument, value?: string) => {
  if (!value || value === "watchers") return watchersOf(task._id);
  if (value === "assignee") return task.assignedTo ? [task.assignedTo] : [];
  return [value];
};

/** `create_task` doesn't need an existing task, so it stands apart */
const createTaskAction = async (
  action: IAutomationAction,
  project: ProjectContext,
  actor: AutomationActor | undefined,
  sprintId?: Types.ObjectId,
) => {
  const title = action.text?.trim();
  if (!title) return undefined;
  const statuses = projectStatuses(project);
  const status =
    statuses.find((entry) => entry.category === StatusCategoryEnum.TODO) ??
    statuses[0]!;
  const type = AvailableTaskTypes.includes(action.taskType as TaskType)
    ? action.taskType!
    : TaskTypeEnum.TASK;
  const assignee = await resolveUserValue(project._id, action.value, actor);
  const { number, key } = await reserveTaskNumber(project._id);
  const task = await Task.create({
    number,
    key,
    rank: await nextRank(project._id),
    type,
    title,
    project: project._id,
    assignedTo: assignee,
    status: status.key,
    statusCategory: status.category,
    // Epics never belong to a sprint
    sprint: type === TaskTypeEnum.EPIC ? undefined : sprintId,
    watchers: assignee ? [assignee] : [],
  });
  await logActivity(task, actor?._id ?? task._id, [
    { type: TaskActivityTypeEnum.CREATED, to: task.status, name: "automation" },
  ]);
  return task;
};

// ---------- Running ----------

interface RunOnTaskOptions {
  rule: IAutomationRule & { _id: Types.ObjectId };
  task: TaskDocument;
  project: ProjectContext;
  actor?: AutomationActor;
  chain: Chain;
}

const runRuleOnTask = async ({
  rule,
  task,
  project,
  actor,
  chain,
}: RunOnTaskOptions) => {
  const failed = firstFailing(rule.conditions, task);
  if (failed !== -1) {
    await log(rule, project, task, "skipped", [
      `Condition ${failed + 1} (${rule.conditions[failed]!.field}) didn't hold`,
    ]);
    return;
  }

  const history: ActivityEntry[] = [];
  const details: string[] = [];
  const changed: FieldChange[] = [];

  for (const action of rule.actions) {
    if (action.type === AutomationActionEnum.CREATE_TASK) continue;
    const result = await applyAction(action, task, project, actor, history);
    if (result.detail) details.push(result.detail);
    if (result.change) changed.push(result.change);
  }

  if (details.length === 0) {
    await log(rule, project, task, "skipped", ["Nothing to change"]);
    return;
  }

  await task.save();
  await logActivity(task, actor?._id ?? rule.createdBy, history);
  await log(rule, project, task, "applied", details);

  // A status set by automation still deserves to reach the watchers
  const statusChange = changed.find((change) => change.field === "status");
  if (statusChange) {
    const statuses = projectStatuses(project);
    await notify({
      type: NotificationTypeEnum.TASK_STATUS_CHANGED,
      recipients: await watchersOf(task._id),
      project: { _id: project._id, name: project.name },
      task,
      excerpt: `${statusName(statuses, statusChange.from ?? "")} → ${statusName(
        statuses,
        statusChange.to ?? "",
      )} (${rule.name})`,
    });
  }

  // What automation changed can set off further rules, within limits
  if (changed.length > 0 && chain.depth + 1 < MAX_DEPTH) {
    await runTaskAutomations({
      event: AutomationEventEnum.TASK_CHANGED,
      task,
      project,
      actor,
      changes: changed,
      chain: { depth: chain.depth + 1, ran: chain.ran },
    });
  }
};

const log = async (
  rule: IAutomationRule & { _id: Types.ObjectId },
  project: ProjectContext,
  task: TaskDocument | undefined,
  status: "applied" | "skipped" | "failed",
  details: string[],
  error?: string,
) => {
  try {
    await AutomationRun.create({
      rule: rule._id,
      project: project._id,
      task: task?._id,
      ruleName: rule.name,
      taskKey: task?.key,
      taskTitle: task?.title,
      status,
      details,
      error,
    });
    if (status === "applied") {
      await AutomationRule.updateOne(
        { _id: rule._id },
        { $set: { lastRunAt: new Date() }, $inc: { runCount: 1 } },
        { timestamps: false },
      );
    }
  } catch (problem) {
    console.error("Failed to record an automation run:", problem);
  }
};

const loadProject = async (
  project: ProjectContext | Types.ObjectId,
): Promise<ProjectContext | null> => {
  if ("name" in (project as ProjectContext)) return project as ProjectContext;
  return Project.findById(project, "name statuses").lean();
};

export interface TaskAutomationOptions {
  event:
    | typeof AutomationEventEnum.TASK_CREATED
    | typeof AutomationEventEnum.TASK_CHANGED;
  task: TaskDocument;
  project: ProjectContext | Types.ObjectId;
  actor?: AutomationActor;
  /** For `task_changed`; ignored when a task is created */
  changes?: FieldChange[];
  chain?: Chain;
}

/**
 * Runs a project's rules against one task. Never throws: a broken rule must
 * not break the edit that set it off.
 */
export const runTaskAutomations = async (options: TaskAutomationOptions) => {
  const chain = options.chain ?? newChain();
  if (chain.depth >= MAX_DEPTH) return;
  try {
    const project = await loadProject(options.project);
    if (!project) return;
    const rules = await AutomationRule.find({
      project: project._id,
      enabled: true,
      "trigger.event": options.event,
    }).lean();
    if (rules.length === 0) return;

    const statuses = projectStatuses(project);
    for (const rule of rules) {
      if (chain.ran.has(String(rule._id))) continue;
      if (
        !matchesTrigger(rule, options.event, options.changes ?? [], statuses)
      ) {
        continue;
      }
      chain.ran.add(String(rule._id));
      try {
        await runRuleOnTask({
          rule,
          task: options.task,
          project,
          actor: options.actor,
          chain,
        });
      } catch (error) {
        await log(
          rule,
          project,
          options.task,
          "failed",
          [],
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  } catch (error) {
    console.error("Automation failed:", error);
  }
};

export interface SprintAutomationOptions {
  event:
    | typeof AutomationEventEnum.SPRINT_STARTED
    | typeof AutomationEventEnum.SPRINT_COMPLETED;
  sprint: { _id: Types.ObjectId; name: string };
  /** The tasks the sprint held at that moment */
  taskIds: Types.ObjectId[];
  project: ProjectContext | Types.ObjectId;
  actor?: AutomationActor;
}

/**
 * Runs sprint rules over the sprint's tasks. A `create_task` action in a
 * sprint rule makes one task, not one per task in the sprint.
 */
export const runSprintAutomations = async (
  options: SprintAutomationOptions,
) => {
  try {
    const project = await loadProject(options.project);
    if (!project) return;
    const rules = await AutomationRule.find({
      project: project._id,
      enabled: true,
      "trigger.event": options.event,
    }).lean();
    if (rules.length === 0) return;

    const tasks = await Task.find({
      _id: { $in: options.taskIds.slice(0, MAX_TASKS_PER_RUN) },
    });

    for (const rule of rules) {
      try {
        const makes = rule.actions.filter(
          (action) => action.type === AutomationActionEnum.CREATE_TASK,
        );
        for (const action of makes) {
          const made = await createTaskAction(
            action,
            project,
            options.actor,
            options.event === AutomationEventEnum.SPRINT_STARTED
              ? options.sprint._id
              : undefined,
          );
          if (made) {
            await log(rule, project, made, "applied", [`Created ${made.key}`]);
          }
        }
        if (rule.actions.length === makes.length) continue;
        for (const task of tasks) {
          await runRuleOnTask({
            rule,
            task,
            project,
            actor: options.actor,
            chain: newChain(),
          });
        }
      } catch (error) {
        await log(
          rule,
          project,
          undefined,
          "failed",
          [],
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  } catch (error) {
    console.error("Sprint automation failed:", error);
  }
};

// ---------- Scheduled rules ----------

/** The hour of the day (0-23) it is right now in `timeZone` */
const hourIn = (timeZone: string) =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );

/**
 * Fires the scheduled rules whose hour has come. The claim is a conditional
 * update on `lastRunAt`, so with several servers running only one fires a rule.
 */
export const runScheduledAutomations = async () => {
  const rules = await AutomationRule.find({
    enabled: true,
    "trigger.event": AutomationEventEnum.SCHEDULE,
  }).lean();
  let fired = 0;

  for (const rule of rules) {
    const timeZone = isValidTimeZone(rule.trigger.timeZone)
      ? rule.trigger.timeZone!
      : DEFAULT_TIME_ZONE;
    const now = Date.now();
    if (hourIn(timeZone) !== (rule.trigger.hour ?? 9)) continue;
    if (rule.trigger.frequency === "weekly") {
      const weekday = new Date(
        `${dayKey(now, timeZone)}T00:00:00.000Z`,
      ).getUTCDay();
      if (weekday !== (rule.trigger.weekday ?? 1)) continue;
    }

    // Claim the day: only the first caller past this line runs the rule
    const claimed = await AutomationRule.findOneAndUpdate(
      {
        _id: rule._id,
        $or: [
          { lastRunAt: { $exists: false } },
          { lastRunAt: null },
          {
            lastRunAt: {
              $lt: new Date(startOfDay(dayKey(now, timeZone), timeZone)),
            },
          },
        ],
      },
      { $set: { lastRunAt: new Date(now) } },
      { timestamps: false },
    ).lean();
    if (!claimed) continue;

    try {
      await runScheduledRule(rule);
      fired += 1;
    } catch (error) {
      const project = await loadProject(rule.project);
      if (project) {
        await log(
          rule,
          project,
          undefined,
          "failed",
          [],
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
  return fired;
};

/**
 * A scheduled rule with no conditions runs once (to make a task or send a
 * notice). With conditions, it sweeps the project's open tasks and acts on
 * each one that matches — "every morning, nudge the watchers of overdue work".
 */
const runScheduledRule = async (
  rule: IAutomationRule & { _id: Types.ObjectId },
) => {
  const project = await loadProject(rule.project);
  if (!project) return;

  for (const action of rule.actions) {
    if (action.type !== AutomationActionEnum.CREATE_TASK) continue;
    const made = await createTaskAction(action, project, undefined);
    if (made)
      await log(rule, project, made, "applied", [`Created ${made.key}`]);
  }

  const taskActions = rule.actions.filter(
    (action) => action.type !== AutomationActionEnum.CREATE_TASK,
  );
  if (taskActions.length === 0 || rule.conditions.length === 0) return;

  const tasks = await Task.find({
    project: project._id,
    statusCategory: { $ne: StatusCategoryEnum.DONE },
  }).limit(MAX_TASKS_PER_RUN);

  for (const task of tasks) {
    if (firstFailing(rule.conditions, task) !== -1) continue;
    await runRuleOnTask({
      rule: { ...rule, actions: taskActions },
      task,
      project,
      chain: newChain(),
    });
  }
};

/** Runs a scheduled rule immediately, so people can try it out */
export const runRuleNow = async (
  rule: IAutomationRule & { _id: Types.ObjectId },
) => runScheduledRule(rule);

/** Checks scheduled rules now and then every hour */
export const startAutomationScheduler = () => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const fired = await runScheduledAutomations();
      if (fired > 0) console.log(`🤖 Ran ${fired} scheduled automation rules`);
    } catch (error) {
      console.error("Scheduled automation failed:", error);
    } finally {
      running = false;
    }
  };
  void run();
  setInterval(run, HOUR_MS).unref();
};

/** Compares a task before and after an edit, for `task_changed` triggers */
export const fieldChanges = (
  before: Record<string, unknown>,
  after: TaskDocument,
): FieldChange[] => {
  const changes: FieldChange[] = [];
  const add = (field: AutomationField, from: unknown, to: unknown) => {
    const a = from === undefined || from === null ? undefined : String(from);
    const b = to === undefined || to === null ? undefined : String(to);
    if (a !== b) changes.push({ field, from: a, to: b });
  };
  add("status", before.status, after.status);
  add("assignee", before.assignedTo, after.assignedTo);
  add("priority", before.priority, after.priority);
  add("sprint", before.sprint, after.sprint);
  add("type", before.type, after.type);
  add(
    "dueDate",
    (before.dueDate as Date | undefined)?.toISOString().slice(0, 10),
    after.dueDate?.toISOString().slice(0, 10),
  );
  add(
    "labels",
    (before.labels as string[] | undefined)?.join(","),
    after.labels.join(","),
  );
  return changes;
};

export type { StatusCategory };
