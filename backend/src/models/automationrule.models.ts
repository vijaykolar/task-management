import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";
import type { TaskType } from "../utils/constants.js";

/** What sets a rule off */
export const AutomationEventEnum = {
  TASK_CREATED: "task_created",
  /** A field on a task changed */
  TASK_CHANGED: "task_changed",
  SPRINT_STARTED: "sprint_started",
  SPRINT_COMPLETED: "sprint_completed",
  /** Every day or every week at a set hour */
  SCHEDULE: "schedule",
} as const;

export type AutomationEvent =
  (typeof AutomationEventEnum)[keyof typeof AutomationEventEnum];

export const AvailableAutomationEvents: AutomationEvent[] =
  Object.values(AutomationEventEnum);

/** Fields a `task_changed` rule can watch */
export const AutomationFieldEnum = {
  STATUS: "status",
  ASSIGNEE: "assignee",
  PRIORITY: "priority",
  SPRINT: "sprint",
  DUE_DATE: "dueDate",
  LABELS: "labels",
  TYPE: "type",
} as const;

export type AutomationField =
  (typeof AutomationFieldEnum)[keyof typeof AutomationFieldEnum];

export const AvailableAutomationFields: AutomationField[] =
  Object.values(AutomationFieldEnum);

export const AutomationOperatorEnum = {
  IS: "is",
  IS_NOT: "is_not",
  CONTAINS: "contains",
  NOT_CONTAINS: "not_contains",
  IS_EMPTY: "is_empty",
  IS_NOT_EMPTY: "is_not_empty",
  /** Numbers only (story points) */
  GT: "gt",
  LT: "lt",
} as const;

export type AutomationOperator =
  (typeof AutomationOperatorEnum)[keyof typeof AutomationOperatorEnum];

export const AvailableAutomationOperators: AutomationOperator[] =
  Object.values(AutomationOperatorEnum);

/** Fields a condition can test */
export const AutomationConditionFieldEnum = {
  TYPE: "type",
  STATUS: "status",
  STATUS_CATEGORY: "statusCategory",
  PRIORITY: "priority",
  ASSIGNEE: "assignee",
  LABELS: "labels",
  SPRINT: "sprint",
  STORY_POINTS: "storyPoints",
  EPIC: "epic",
  DUE_DATE: "dueDate",
} as const;

export type AutomationConditionField =
  (typeof AutomationConditionFieldEnum)[keyof typeof AutomationConditionFieldEnum];

export const AvailableAutomationConditionFields: AutomationConditionField[] =
  Object.values(AutomationConditionFieldEnum);

export const AutomationActionEnum = {
  SET_STATUS: "set_status",
  SET_ASSIGNEE: "set_assignee",
  SET_PRIORITY: "set_priority",
  SET_SPRINT: "set_sprint",
  SET_DUE_DATE: "set_due_date",
  ADD_LABELS: "add_labels",
  REMOVE_LABELS: "remove_labels",
  ADD_COMMENT: "add_comment",
  /** An in-app notification; automation never sends email */
  NOTIFY: "notify",
  CREATE_TASK: "create_task",
} as const;

export type AutomationActionType =
  (typeof AutomationActionEnum)[keyof typeof AutomationActionEnum];

export const AvailableAutomationActions: AutomationActionType[] =
  Object.values(AutomationActionEnum);

export interface IAutomationTrigger {
  event: AutomationEvent;
  /** `task_changed`: the field that has to change */
  field?: AutomationField;
  /** `task_changed`: only when the field becomes this value */
  to?: string;
  /** `task_changed`: only when the field was this value */
  from?: string;
  /** `schedule`: how often */
  frequency?: "daily" | "weekly";
  /** `schedule` weekly: 0 = Sunday */
  weekday?: number;
  /** `schedule`: hour of the day, 0-23 */
  hour?: number;
  /** `schedule`: the zone that hour is read in */
  timeZone?: string;
}

export interface IAutomationCondition {
  field: AutomationConditionField;
  op: AutomationOperator;
  /** Not used by `is_empty` / `is_not_empty` */
  value?: string;
}

export interface IAutomationAction {
  type: AutomationActionType;
  /**
   * The action's target, read differently per type: a status key, a user id
   * (or "unassigned" / "actor"), a priority, a sprint id (or "backlog" /
   * "active" / "next"), or the recipients of a notification ("watchers" /
   * "assignee" / a user id).
   */
  value?: string;
  /** `set_due_date`: days from today, negative for the past */
  days?: number;
  labels?: string[];
  /** Comment or notification text; the title of a created task */
  text?: string;
  /** `create_task` */
  taskType?: TaskType;
}

export interface IAutomationRule {
  project: Types.ObjectId;
  name: string;
  enabled: boolean;
  trigger: IAutomationTrigger;
  /** All of them have to hold for the actions to run */
  conditions: IAutomationCondition[];
  actions: IAutomationAction[];
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  /** Housekeeping for the rule list and the scheduler */
  lastRunAt?: Date;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type AutomationRuleDocument = HydratedDocument<IAutomationRule>;

export const MAX_RULES_PER_PROJECT = 30;
export const MAX_CONDITIONS_PER_RULE = 8;
export const MAX_ACTIONS_PER_RULE = 8;

const triggerSchema = new Schema<IAutomationTrigger>(
  {
    event: {
      type: String,
      enum: AvailableAutomationEvents,
      required: true,
    },
    field: { type: String, enum: AvailableAutomationFields },
    to: String,
    from: String,
    frequency: { type: String, enum: ["daily", "weekly"] },
    weekday: { type: Number, min: 0, max: 6 },
    hour: { type: Number, min: 0, max: 23 },
    timeZone: String,
  },
  { _id: false },
);

const conditionSchema = new Schema<IAutomationCondition>(
  {
    field: {
      type: String,
      enum: AvailableAutomationConditionFields,
      required: true,
    },
    op: {
      type: String,
      enum: AvailableAutomationOperators,
      required: true,
    },
    value: String,
  },
  { _id: false },
);

const actionSchema = new Schema<IAutomationAction>(
  {
    type: {
      type: String,
      enum: AvailableAutomationActions,
      required: true,
    },
    value: String,
    days: Number,
    labels: { type: [String], default: undefined },
    text: String,
    taskType: String,
  },
  { _id: false },
);

const automationRuleSchema = new Schema<IAutomationRule>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    trigger: { type: triggerSchema, required: true },
    conditions: { type: [conditionSchema], default: [] },
    actions: { type: [actionSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastRunAt: Date,
    runCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// The hot path: every task change looks up the project's enabled rules
automationRuleSchema.index({ project: 1, enabled: 1, "trigger.event": 1 });

export const AutomationRule = mongoose.model<IAutomationRule>(
  "AutomationRule",
  automationRuleSchema,
);
