import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";
import {
  AvailableStatusCategories,
  AvailableTaskPriorities,
  AvailableTaskTypes,
  StatusCategoryEnum,
  TaskPriorityEnum,
  TaskStatusEnum,
  TaskTypeEnum,
  type StatusCategory,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "../utils/constants.js";

export interface ITaskAttachment {
  _id?: Types.ObjectId;
  url: string;
  /** Original file name, for display */
  name: string;
  /** Path on disk, used to delete the file */
  localPath: string;
  mimetype: string;
  size: number;
}

export interface ITask {
  /** Ticket number within the project (SPST-12 -> 12) */
  number: number;
  /** Ticket key, e.g. SPST-12. Project keys are locked once tasks exist. */
  key: string;
  type: TaskType;
  title: string;
  description?: string;
  project: Types.ObjectId;
  assignedTo?: Types.ObjectId;
  assignedBy?: Types.ObjectId;
  /** Key of a status in the project's workflow */
  status: TaskStatus;
  /** Copy of the status' category, kept in sync, for queries and reports */
  statusCategory: StatusCategory;
  priority: TaskPriority;
  /** Stored at 12:00 UTC so the calendar day is the same in every timezone */
  dueDate?: Date;
  labels: string[];
  /** Estimate; missing = unestimated */
  storyPoints?: number;
  /** Missing = backlog */
  sprint?: Types.ObjectId;
  /** Parent epic (a task of type "epic" in the same project) */
  epic?: Types.ObjectId;
  attachments: ITaskAttachment[];
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDocument = HydratedDocument<ITask>;

const taskSchema = new Schema<ITask>(
  {
    number: { type: Number, required: true },
    key: { type: String, required: true },
    type: {
      type: String,
      enum: AvailableTaskTypes,
      default: TaskTypeEnum.TASK,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      default: TaskStatusEnum.TODO,
    },
    statusCategory: {
      type: String,
      enum: AvailableStatusCategories,
      default: StatusCategoryEnum.TODO,
    },
    priority: {
      type: String,
      enum: AvailableTaskPriorities,
      default: TaskPriorityEnum.MEDIUM,
    },
    dueDate: Date,
    labels: {
      type: [String],
      default: [],
      index: true,
    },
    storyPoints: { type: Number, min: 0, max: 1000 },
    sprint: {
      type: Schema.Types.ObjectId,
      ref: "Sprint",
      index: true,
    },
    epic: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      index: true,
    },
    attachments: {
      type: [
        {
          url: { type: String, required: true },
          name: { type: String, required: true },
          localPath: { type: String, required: true },
          mimetype: { type: String, required: true },
          size: { type: Number, required: true },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      // Never expose server file paths to clients
      transform: (_doc, ret: { attachments?: Partial<ITaskAttachment>[] }) => {
        ret.attachments?.forEach((file) => delete file.localPath);
        return ret;
      },
    },
  },
);

taskSchema.index({ key: 1 }, { unique: true });
taskSchema.index({ project: 1, number: 1 }, { unique: true });

export const Task = mongoose.model<ITask>("Task", taskSchema);
