import type { UserDocument } from "../models/user.models.js";
import type { UserRole } from "../utils/constants.js";

/**
 * The user attached to a request by `verifyJWT`. `role` is not part of the user
 * schema - it is set per request by `validateProjectPermission`.
 */
export type AuthenticatedUser = UserDocument & { role?: UserRole };
