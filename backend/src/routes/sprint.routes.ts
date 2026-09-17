import { Router } from "express";
import {
  correctSprintReport,
  completeSprint,
  createSprint,
  deleteSprint,
  getSprints,
  startSprint,
  updateSprint,
} from "../controllers/sprint.controllers.js";
import {
  validateProjectPermission,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { broadcastProjectChange } from "../middlewares/realtime.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import { AvailableUserRole, UserRolesEnum } from "../utils/constants.js";
import { sprintValidator } from "../validators/index.js";

// Planning is a task-management action (PRD §4.2)
const PLANNERS = [UserRolesEnum.ADMIN, UserRolesEnum.PROJECT_ADMIN];
const broadcast = broadcastProjectChange("sprints");

const router = Router();
router.use(verifyJWT);

router
  .route("/:projectId")
  .get(validateProjectPermission(AvailableUserRole), getSprints)
  .post(
    validateProjectPermission(PLANNERS),
    broadcast,
    sprintValidator(),
    validate,
    createSprint,
  );

router
  .route("/:projectId/s/:sprintId")
  .put(
    validateProjectPermission(PLANNERS),
    broadcast,
    sprintValidator(),
    validate,
    updateSprint,
  )
  .delete(validateProjectPermission(PLANNERS), broadcast, deleteSprint);

router
  .route("/:projectId/s/:sprintId/start")
  .post(validateProjectPermission(PLANNERS), broadcast, startSprint);

router
  .route("/:projectId/s/:sprintId/complete")
  .post(validateProjectPermission(PLANNERS), broadcast, completeSprint);

// Review and correct the report of a sprint from before reports existed
router
  .route("/:projectId/s/:sprintId/report")
  .put(validateProjectPermission(PLANNERS), broadcast, correctSprintReport);

export default router;
