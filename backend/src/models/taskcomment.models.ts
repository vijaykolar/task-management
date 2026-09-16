import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";

/** A comment on a task (Jira-style activity) */
export interface ITaskComment {
  task: Types.ObjectId;
  project: Types.ObjectId;
  author: Types.ObjectId;
  /** Sanitized rich text HTML */
  body: string;
  /** Plain text of `body`, for previews and length limits */
  bodyText: string;
  editedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskCommentDocument = HydratedDocument<ITaskComment>;

const taskCommentSchema = new Schema<ITaskComment>(
  {
    task: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    bodyText: {
      type: String,
      required: true,
    },
    editedAt: Date,
  },
  { timestamps: true },
);

taskCommentSchema.index({ task: 1, createdAt: -1 });

export const TaskComment = mongoose.model<ITaskComment>(
  "TaskComment",
  taskCommentSchema,
);
