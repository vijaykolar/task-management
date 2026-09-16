import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";

export interface IProject {
  name: string;
  description?: string;
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

export const Project = mongoose.model<IProject>("Project", projectSchema);
