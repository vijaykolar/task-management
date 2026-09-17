import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";

/**
 * One due-date reminder already sent to one person. "Due today" depends on the
 * recipient's own time zone, so reminders are claimed per person: inserting
 * the row is the claim, and the unique index means it can only happen once,
 * even with several servers running.
 */
export interface IDueReminder {
  task: Types.ObjectId;
  user: Types.ObjectId;
  kind: "due_soon" | "overdue";
  /** The due date it was sent for, so changing the date re-arms it */
  dueKey: string;
  createdAt: Date;
}

export type DueReminderDocument = HydratedDocument<IDueReminder>;

const REMINDER_TTL_DAYS = 60;

const dueReminderSchema = new Schema<IDueReminder>(
  {
    task: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["due_soon", "overdue"], required: true },
    dueKey: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

dueReminderSchema.index(
  { task: 1, user: 1, kind: 1, dueKey: 1 },
  { unique: true },
);
// Old claims clean themselves up
dueReminderSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: REMINDER_TTL_DAYS * 24 * 60 * 60 },
);

export const DueReminder = mongoose.model<IDueReminder>(
  "DueReminder",
  dueReminderSchema,
);
