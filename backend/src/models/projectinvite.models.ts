import mongoose, { Schema, type HydratedDocument, type Types } from "mongoose";
import {
  AvailableUserRole,
  UserRolesEnum,
  type UserRole,
} from "../utils/constants.js";

export const INVITE_TTL_DAYS = 7;

export const InviteStatusEnum = {
  PENDING: "pending",
  ACCEPTED: "accepted",
} as const;

export type InviteStatus =
  (typeof InviteStatusEnum)[keyof typeof InviteStatusEnum];

/**
 * An invitation for an email that has no account yet. It is accepted
 * automatically when someone verifies that email address.
 */
export interface IProjectInvite {
  project: Types.ObjectId;
  email: string;
  role: UserRole;
  invitedBy: Types.ObjectId;
  status: InviteStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectInviteDocument = HydratedDocument<IProjectInvite>;

const projectInviteSchema = new Schema<IProjectInvite>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: AvailableUserRole,
      default: UserRolesEnum.MEMBER,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(InviteStatusEnum),
      default: InviteStatusEnum.PENDING,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

// One invitation per email per project; re-inviting refreshes it
projectInviteSchema.index({ project: 1, email: 1 }, { unique: true });

export const inviteExpiryDate = () =>
  new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

export const ProjectInvite = mongoose.model<IProjectInvite>(
  "ProjectInvite",
  projectInviteSchema,
);
