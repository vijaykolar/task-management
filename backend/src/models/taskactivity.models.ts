import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";

export const TaskActivityTypeEnum = {
  CREATED: "created",
  TITLE_CHANGED: "title_changed",
  DESCRIPTION_CHANGED: "description_changed",
  STATUS_CHANGED: "status_changed",
  PRIORITY_CHANGED: "priority_changed",
  ASSIGNEE_CHANGED: "assignee_changed",
  DUE_DATE_CHANGED: "due_date_changed",
  LABELS_CHANGED: "labels_changed",
  ATTACHMENT_ADDED: "attachment_added",
  ATTACHMENT_REMOVED: "attachment_removed",
  SUBTASK_ADDED: "subtask_added",
  SUBTASK_COMPLETED: "subtask_completed",
  SUBTASK_REOPENED: "subtask_reopened",
  SUBTASK_DELETED: "subtask_deleted",
  COMMENT_ADDED: "comment_added",
  SPRINT_CHANGED: "sprint_changed",
} as const;

export type TaskActivityType =
  (typeof TaskActivityTypeEnum)[keyof typeof TaskActivityTypeEnum];

/**
 * One entry of a task's history ("A moved this from To do to Done").
 * `from` / `to` hold the old and new values; `name` a related item's name.
 */
export interface ITaskActivity {
  task: Types.ObjectId;
  project: Types.ObjectId;
  actor: Types.ObjectId;
  type: TaskActivityType;
  from?: unknown;
  to?: unknown;
  name?: string;
  createdAt: Date;
}

export type TaskActivityDocument = HydratedDocument<ITaskActivity>;

const taskActivitySchema = new Schema<ITaskActivity>(
  {
    task: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: Object.values(TaskActivityTypeEnum),
      required: true,
    },
    from: Schema.Types.Mixed,
    to: Schema.Types.Mixed,
    name: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

taskActivitySchema.index({ task: 1, createdAt: -1 });

export const TaskActivity = mongoose.model<ITaskActivity>(
  "TaskActivity",
  taskActivitySchema,
);
