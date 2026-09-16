import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";

export const SprintStatusEnum = {
  PLANNED: "planned",
  ACTIVE: "active",
  COMPLETED: "completed",
} as const;

export type SprintStatus =
  (typeof SprintStatusEnum)[keyof typeof SprintStatusEnum];

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
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type SprintDocument = HydratedDocument<ISprint>;

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
