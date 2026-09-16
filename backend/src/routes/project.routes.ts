import { Router } from "express";
import {
  addMembersToProject,
  createProject,
  deleteMember,
  deleteProject,
  getProjectById,
  getProjectInvites,
  getProjectMembers,
  getProjects,
  leaveProject,
  resendInvite,
  revokeInvite,
  transferOwnership,
  updateMemberRole,
  updateProject,
} from "../controllers/project.controllers.js";
import {
  validateProjectPermission,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { inviteLimiter } from "../middlewares/rate-limit.middleware.js";
import { broadcastProjectChange } from "../middlewares/realtime.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import { AvailableUserRole, UserRolesEnum } from "../utils/constants.js";
import {
  addMembertoProjectValidator,
  createProjectValidator,
  transferOwnershipValidator,
} from "../validators/index.js";

const ADMIN_ONLY = [UserRolesEnum.ADMIN];
const projectChanged = broadcastProjectChange("project");
const membersChanged = broadcastProjectChange("members");

const router = Router();
router.use(verifyJWT);

router
  .route("/")
  .get(getProjects)
  .post(createProjectValidator(), validate, createProject);

router
  .route("/:projectId")
  .get(validateProjectPermission(AvailableUserRole), getProjectById)
  .put(
    validateProjectPermission(ADMIN_ONLY),
    projectChanged,
    createProjectValidator(),
    validate,
    updateProject,
  )
  .delete(validateProjectPermission(ADMIN_ONLY), projectChanged, deleteProject);

router
  .route("/:projectId/leave")
  .post(
    validateProjectPermission(AvailableUserRole),
    membersChanged,
    leaveProject,
  );

router.route("/:projectId/transfer-ownership").post(
  // Further restricted to the owner inside the controller
  validateProjectPermission(ADMIN_ONLY),
  membersChanged,
  transferOwnershipValidator(),
  validate,
  transferOwnership,
);

router
  .route("/:projectId/members")
  .get(validateProjectPermission(AvailableUserRole), getProjectMembers)
  .post(
    validateProjectPermission(ADMIN_ONLY),
    membersChanged,
    inviteLimiter,
    addMembertoProjectValidator(),
    validate,
    addMembersToProject,
  );

router
  .route("/:projectId/members/:userId")
  .put(validateProjectPermission(ADMIN_ONLY), membersChanged, updateMemberRole)
  .delete(validateProjectPermission(ADMIN_ONLY), membersChanged, deleteMember);

router
  .route("/:projectId/invites")
  .get(validateProjectPermission(ADMIN_ONLY), getProjectInvites);

router
  .route("/:projectId/invites/:inviteId")
  .delete(validateProjectPermission(ADMIN_ONLY), revokeInvite);

router
  .route("/:projectId/invites/:inviteId/resend")
  .post(validateProjectPermission(ADMIN_ONLY), inviteLimiter, resendInvite);

export default router;
