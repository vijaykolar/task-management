import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";

/** A personal, named set of task filters for one project */
export interface ISavedFilter {
  user: Types.ObjectId;
  project: Types.ObjectId;
  name: string;
  /** Query-string style filters, e.g. { assignee: "me", type: "bug" } */
  filters: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export type SavedFilterDocument = HydratedDocument<ISavedFilter>;

const savedFilterSchema = new Schema<ISavedFilter>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    filters: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false },
);

savedFilterSchema.index({ user: 1, project: 1, name: 1 }, { unique: true });

export const SavedFilter = mongoose.model<ISavedFilter>(
  "SavedFilter",
  savedFilterSchema,
);
