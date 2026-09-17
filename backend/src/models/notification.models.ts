import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";

export const NotificationTypeEnum = {
  TASK_ASSIGNED: "task_assigned",
  TASK_COMMENTED: "task_commented",
  MENTIONED: "mentioned",
  // For people watching a task
  TASK_STATUS_CHANGED: "task_status_changed",
  TASK_LINKED: "task_linked",
  TASK_DUE_SOON: "task_due_soon",
  TASK_OVERDUE: "task_overdue",
  /** Sent by an automation rule */
  AUTOMATION: "automation",
} as const;

export type NotificationType =
  (typeof NotificationTypeEnum)[keyof typeof NotificationTypeEnum];

export interface INotification {
  recipient: Types.ObjectId;
  /** Missing for reminders the app sends on its own (due dates) */
  actor?: Types.ObjectId;
  type: NotificationType;
  project: Types.ObjectId;
  task?: Types.ObjectId;
  /** Snapshot for display, so it still reads well if the task is renamed */
  projectName: string;
  taskTitle?: string;
  /** Ticket key snapshot, e.g. SPST-12 */
  taskKey?: string;
  /** Short plain-text excerpt: a comment, or what changed */
  excerpt?: string;
  readAt?: Date;
  createdAt: Date;
}

export type NotificationDocument = HydratedDocument<INotification>;

const NOTIFICATION_TTL_DAYS = 90;

const notificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    type: {
      type: String,
      enum: Object.values(NotificationTypeEnum),
      required: true,
    },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    task: { type: Schema.Types.ObjectId, ref: "Task" },
    projectName: { type: String, required: true },
    taskTitle: String,
    taskKey: String,
    excerpt: String,
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });
// Old notifications clean themselves up
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: NOTIFICATION_TTL_DAYS * 24 * 60 * 60 },
);

export const Notification = mongoose.model<INotification>(
  "Notification",
  notificationSchema,
);
