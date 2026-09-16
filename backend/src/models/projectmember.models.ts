import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";
import {
  AvailableUserRole,
  UserRolesEnum,
  type UserRole,
} from "../utils/constants.js";

export interface IProjectMember {
  user: Types.ObjectId;
  project: Types.ObjectId;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectMemberDocument = HydratedDocument<IProjectMember>;

const projectMemberSchema = new Schema<IProjectMember>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    role: {
      type: String,
      enum: AvailableUserRole,
      default: UserRolesEnum.MEMBER,
    },
  },
  { timestamps: true },
);

// One membership per user per project
projectMemberSchema.index({ project: 1, user: 1 }, { unique: true });

export const ProjectMember = mongoose.model<IProjectMember>(
  "ProjectMember",
  projectMemberSchema,
);
