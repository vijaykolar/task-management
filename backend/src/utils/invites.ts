import {
  InviteStatusEnum,
  ProjectInvite,
} from "../models/projectinvite.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import type { UserDocument } from "../models/user.models.js";

/**
 * Turns pending, unexpired invitations for this (now verified) email into
 * project memberships. Existing memberships keep their current role.
 * Returns how many projects the user joined.
 */
export const acceptPendingInvites = async (user: UserDocument) => {
  const invites = await ProjectInvite.find({
    email: user.email,
    status: InviteStatusEnum.PENDING,
    expiresAt: { $gt: new Date() },
  });

  let joined = 0;
  for (const invite of invites) {
    const result = await ProjectMember.updateOne(
      { project: invite.project, user: user._id },
      { $setOnInsert: { role: invite.role } },
      { upsert: true },
    );
    joined += result.upsertedCount;
    invite.status = InviteStatusEnum.ACCEPTED;
    await invite.save();
  }
  return joined;
};
