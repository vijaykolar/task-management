import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";
import {
  AvailableStatusCategories,
  StatusCategoryEnum,
  type StatusCategory,
} from "../utils/constants.js";

/** One column of the project's workflow */
export interface IProjectStatus {
  /** Stable id stored on tasks; never changes when the status is renamed */
  key: string;
  name: string;
  category: StatusCategory;
  /** Removed from the workflow but kept so history can still be read */
  archived?: boolean;
}

export const DEFAULT_STATUSES: IProjectStatus[] = [
  { key: "todo", name: "To do", category: StatusCategoryEnum.TODO },
  {
    key: "in_progress",
    name: "In progress",
    category: StatusCategoryEnum.IN_PROGRESS,
  },
  { key: "done", name: "Done", category: StatusCategoryEnum.DONE },
];

export interface IProject {
  name: string;
  description?: string;
  /** Prefix of ticket keys, e.g. "SPST" in SPST-12 */
  key: string;
  /** Last ticket number handed out */
  taskCounter: number;
  /** Workflow in board order */
  statuses: IProjectStatus[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectDocument = HydratedDocument<IProject>;

const projectSchema = new Schema<IProject>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
    },
    key: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    taskCounter: { type: Number, default: 0 },
    statuses: {
      type: [
        new Schema<IProjectStatus>(
          {
            key: { type: String, required: true },
            name: { type: String, required: true, trim: true },
            category: {
              type: String,
              enum: AvailableStatusCategories,
              required: true,
            },
            archived: Boolean,
          },
          { _id: false },
        ),
      ],
      default: () => DEFAULT_STATUSES.map((status) => ({ ...status })),
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

// Names are unique per owner, not globally: two teams can both have "Website"
projectSchema.index({ createdBy: 1, name: 1 }, { unique: true });
// Ticket keys are global, so SPST-12 identifies exactly one task
projectSchema.index({ key: 1 }, { unique: true });

export const Project = mongoose.model<IProject>("Project", projectSchema);
