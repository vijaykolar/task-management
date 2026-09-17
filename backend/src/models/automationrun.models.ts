import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";

/**
 * One time a rule fired, kept so people can see why a task changed on its own
 * and why a rule they expected to fire didn't. Rows expire after a month.
 */
export interface IAutomationRun {
  rule: Types.ObjectId;
  project: Types.ObjectId;
  task?: Types.ObjectId;
  /** Snapshots, so the log still reads well after a rename or a delete */
  ruleName: string;
  taskKey?: string;
  taskTitle?: string;
  status: "applied" | "skipped" | "failed";
  /** What it did, or why it stopped: "Set status to Done", "Condition 2 failed" */
  details: string[];
  error?: string;
  createdAt: Date;
}

export type AutomationRunDocument = HydratedDocument<IAutomationRun>;

const RUN_TTL_DAYS = 30;

const automationRunSchema = new Schema<IAutomationRun>(
  {
    rule: {
      type: Schema.Types.ObjectId,
      ref: "AutomationRule",
      required: true,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    task: { type: Schema.Types.ObjectId, ref: "Task" },
    ruleName: { type: String, required: true },
    taskKey: String,
    taskTitle: String,
    status: {
      type: String,
      enum: ["applied", "skipped", "failed"],
      required: true,
    },
    details: { type: [String], default: [] },
    error: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

automationRunSchema.index({ project: 1, createdAt: -1 });
automationRunSchema.index({ rule: 1, createdAt: -1 });
automationRunSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: RUN_TTL_DAYS * 24 * 60 * 60 },
);

export const AutomationRun = mongoose.model<IAutomationRun>(
  "AutomationRun",
  automationRunSchema,
);
