import { Router } from "express";
import {
  getSprintReport,
  getVelocity,
} from "../controllers/report.controllers.js";
import {
  validateProjectPermission,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import { AvailableUserRole } from "../utils/constants.js";
import { reportQueryValidator } from "../validators/index.js";

const router = Router();
router.use(verifyJWT);

router
  .route("/:projectId/sprints/:sprintId")
  .get(
    validateProjectPermission(AvailableUserRole),
    reportQueryValidator(),
    validate,
    getSprintReport,
  );

router
  .route("/:projectId/velocity")
  .get(
    validateProjectPermission(AvailableUserRole),
    reportQueryValidator(),
    validate,
    getVelocity,
  );

export default router;
