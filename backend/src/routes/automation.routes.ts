import { Router } from "express";
import {
  createAutomationRule,
  deleteAutomationRule,
  getAutomationRules,
  getAutomationRuns,
  runAutomationRule,
  updateAutomationRule,
} from "../controllers/automation.controllers.js";
import {
  validateProjectPermission,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { AvailableUserRole, UserRolesEnum } from "../utils/constants.js";

// Rules change what happens to everyone's work, so only admins write them
const PLANNERS = [UserRolesEnum.ADMIN, UserRolesEnum.PROJECT_ADMIN];

const router = Router();
router.use(verifyJWT);

router
  .route("/:projectId")
  .get(validateProjectPermission(AvailableUserRole), getAutomationRules)
  .post(validateProjectPermission(PLANNERS), createAutomationRule);

// The log is worth reading for anyone wondering why a task changed on its own
router
  .route("/:projectId/runs")
  .get(validateProjectPermission(AvailableUserRole), getAutomationRuns);

router
  .route("/:projectId/r/:ruleId")
  .put(validateProjectPermission(PLANNERS), updateAutomationRule)
  .delete(validateProjectPermission(PLANNERS), deleteAutomationRule);

router
  .route("/:projectId/r/:ruleId/run")
  .post(validateProjectPermission(PLANNERS), runAutomationRule);

export default router;
