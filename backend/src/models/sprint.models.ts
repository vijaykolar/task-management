import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";
import type { TaskStatus } from "../utils/constants.js";

export const SprintStatusEnum = {
  PLANNED: "planned",
  ACTIVE: "active",
  COMPLETED: "completed",
} as const;

export type SprintStatus =
  (typeof SprintStatusEnum)[keyof typeof SprintStatusEnum];

export interface Tally {
  count: number;
  points: number;
}

/** A task as it was when the sprint started */
export interface SprintSnapshotEntry {
  task: Types.ObjectId;
  status: TaskStatus;
  storyPoints?: number;
}

/** Report totals frozen when the sprint is completed (used by velocity) */
export interface SprintStats {
  committed: Tally;
  completed: Tally;
  added: Tally;
  removed: Tally;
  carriedOver: Tally;
  estimateDelta: number;
  unestimated: number;
  approximate: boolean;
  computedAt: Date;
}

/**
 * Where a sprint's report data comes from. Missing = recorded as it happened.
 * "rebuilt": the sprint predates reports, so its data was reconstructed from
 * history (approximate). "confirmed": an admin reviewed and corrected it.
 */
export type SprintReportSource = "rebuilt" | "confirmed";

/** A time-boxed iteration. Tasks without a sprint are in the backlog. */
export interface ISprint {
  project: Types.ObjectId;
  name: string;
  goal?: string;
  /** Calendar days, stored at 12:00 UTC like task due dates */
  startDate?: Date;
  endDate?: Date;
  status: SprintStatus;
  startedAt?: Date;
  completedAt?: Date;
  /** Missing for sprints started before reports existed */
  startSnapshot?: SprintSnapshotEntry[];
  /**
   * Tasks in the sprint when it ended. Only kept for rebuilt or corrected
   * sprints, whose history can't tell this reliably.
   */
  endSnapshot?: SprintSnapshotEntry[];
  reportSource?: SprintReportSource;
  reportConfirmedAt?: Date;
  reportConfirmedBy?: Types.ObjectId;
  stats?: SprintStats;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type SprintDocument = HydratedDocument<ISprint>;

const tallySchema = new Schema<Tally>(
  { count: { type: Number, default: 0 }, points: { type: Number, default: 0 } },
  { _id: false },
);

const snapshotEntrySchema = new Schema<SprintSnapshotEntry>(
  {
    task: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    status: { type: String, required: true },
    storyPoints: Number,
  },
  { _id: false },
);

const sprintSchema = new Schema<ISprint>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    goal: { type: String, trim: true },
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: Object.values(SprintStatusEnum),
      default: SprintStatusEnum.PLANNED,
    },
    startedAt: Date,
    completedAt: Date,
    startSnapshot: {
      type: [snapshotEntrySchema],
      // No snapshot and an empty one mean different things
      default: undefined,
    },
    endSnapshot: { type: [snapshotEntrySchema], default: undefined },
    reportSource: { type: String, enum: ["rebuilt", "confirmed"] },
    reportConfirmedAt: Date,
    reportConfirmedBy: { type: Schema.Types.ObjectId, ref: "User" },
    stats: {
      type: new Schema<SprintStats>(
        {
          committed: tallySchema,
          completed: tallySchema,
          added: tallySchema,
          removed: tallySchema,
          carriedOver: tallySchema,
          estimateDelta: Number,
          unestimated: Number,
          approximate: Boolean,
          computedAt: Date,
        },
        { _id: false },
      ),
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

// At most one active sprint per project
sprintSchema.index(
  { project: 1 },
  {
    unique: true,
    partialFilterExpression: { status: SprintStatusEnum.ACTIVE },
    name: "one_active_sprint_per_project",
  },
);

export const Sprint = mongoose.model<ISprint>("Sprint", sprintSchema);
