import type { Request } from "express";
import { ApiError } from "./api-error.js";
import type { AuthenticatedUser } from "../types/auth.js";

/**
 * Returns the user attached by `verifyJWT`. Throws if the route was reached
 * without that middleware (or without a valid token).
 */
export const requireUser = <P>(req: Request<P>): AuthenticatedUser => {
  if (!req.user) {
    throw new ApiError(401, "Unauthorized request");
  }
  return req.user;
};
