import mongoose from "mongoose";
import { SAFE_USER_SELECT, User } from "../models/user.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requireUser } from "../utils/request-user.js";
import type { UserRole } from "../utils/constants.js";
import { toObjectId } from "../utils/object-id.js";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { RequestHandler } from "express";

export const verifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET,
    ) as JwtPayload;
    // passwordChangedAt is needed below; toJSON strips it from responses
    const user = await User.findById(decodedToken?._id).select(
      SAFE_USER_SELECT.replace("-passwordChangedAt", ""),
    );

    if (!user) {
      throw new ApiError(401, "Invalid access token");
    }

    // Tokens issued before a password change/reset are revoked
    if (
      user.passwordChangedAt &&
      (decodedToken.iat ?? 0) * 1000 < user.passwordChangedAt.getTime()
    ) {
      throw new ApiError(401, "Session expired. Please sign in again.");
    }

    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401, "Invalid access token");
  }
});

export const validateProjectPermission = (
  roles: UserRole[] = [],
): RequestHandler<{ projectId: string }> => {
  return asyncHandler<{ projectId: string }>(async (req, res, next) => {
    const { projectId } = req.params;

    if (!projectId) {
      throw new ApiError(400, "project id is missing");
    }

    const user = requireUser(req);

    const project = await ProjectMember.findOne({
      project: toObjectId(projectId, "project id"),
      user: new mongoose.Types.ObjectId(user._id),
    });

    // Non-members get 404 so project ids can't be probed
    if (!project) {
      throw new ApiError(404, "Project not found");
    }

    const givenRole = project?.role;

    user.role = givenRole;

    if (!roles.includes(givenRole)) {
      throw new ApiError(
        403,
        "You do not have permission to perform this action",
      );
    }

    next();
  });
};
