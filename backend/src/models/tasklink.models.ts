import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";
import {
  AvailableTaskLinkTypes,
  type TaskLinkType,
} from "../utils/constants.js";

/**
 * A directed relation between two tasks of the same project, read as
 * "source <type> target" (e.g. SPST-1 blocks SPST-4). The target shows the
 * inverse ("is blocked by").
 */
export interface ITaskLink {
  project: Types.ObjectId;
  source: Types.ObjectId;
  target: Types.ObjectId;
  type: TaskLinkType;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export type TaskLinkDocument = HydratedDocument<ITaskLink>;

const taskLinkSchema = new Schema<ITaskLink>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    source: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    target: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    type: { type: String, enum: AvailableTaskLinkTypes, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

taskLinkSchema.index({ source: 1, target: 1, type: 1 }, { unique: true });
taskLinkSchema.index({ target: 1, type: 1 });

export const TaskLink = mongoose.model<ITaskLink>("TaskLink", taskLinkSchema);
