import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";
import {
  AvailableTaskPriorities,
  AvailableTaskStatues,
  TaskPriorityEnum,
  TaskStatusEnum,
  type TaskPriority,
  type TaskStatus,
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
  title: string;
  description?: string;
  project: Types.ObjectId;
  assignedTo?: Types.ObjectId;
  assignedBy?: Types.ObjectId;
  status: TaskStatus;
  priority: TaskPriority;
  /** Stored at 12:00 UTC so the calendar day is the same in every timezone */
  dueDate?: Date;
  labels: string[];
  /** Estimate; missing = unestimated */
  storyPoints?: number;
  /** Missing = backlog */
  sprint?: Types.ObjectId;
  attachments: ITaskAttachment[];
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDocument = HydratedDocument<ITask>;

const taskSchema = new Schema<ITask>(
  {
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
      enum: AvailableTaskStatues,
      default: TaskStatusEnum.TODO,
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

export const Task = mongoose.model<ITask>("Task", taskSchema);
