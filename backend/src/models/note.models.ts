import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";

export interface IProjectNote {
  project: Types.ObjectId;
  createdBy: Types.ObjectId;
  /** Sanitized rich text HTML */
  content: string;
  /** Plain text of `content`, for search and previews */
  contentText: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectNoteDocument = HydratedDocument<IProjectNote>;

const projectNoteSchema = new Schema<IProjectNote>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    contentText: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

export const ProjectNote = mongoose.model<IProjectNote>(
  "ProjectNote",
  projectNoteSchema,
);
