import { Router } from "express";
import {
  getMyTasks,
  addTaskComment,
  deleteTaskComment,
  getTaskComments,
  getProjectLabels,
  getTaskActivity,
  updateTaskComment,
  createSubTask,
  createTask,
  deleteAttachment,
  deleteSubTask,
  deleteTask,
  getTaskById,
  getTasks,
  updateSubTask,
  updateTask,
} from "../controllers/task.controllers.js";
import {
  validateProjectPermission,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { uploadAttachments } from "../middlewares/multer.middleware.js";
import { broadcastProjectChange } from "../middlewares/realtime.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import { AvailableUserRole, UserRolesEnum } from "../utils/constants.js";
import {
  commentValidator,
  createSubtaskValidator,
  createTaskValidator,
  updateSubtaskValidator,
  updateTaskValidator,
} from "../validators/index.js";

// Permission matrix: PRD.md §4.2
const TASK_MANAGERS = [UserRolesEnum.ADMIN, UserRolesEnum.PROJECT_ADMIN];

const broadcast = broadcastProjectChange("tasks");

const router = Router();
router.use(verifyJWT);

// Must come before /:projectId
router.route("/me").get(getMyTasks);

router
  .route("/:projectId")
  .get(validateProjectPermission(AvailableUserRole), getTasks)
  .post(
    validateProjectPermission(TASK_MANAGERS),
    broadcast,
    uploadAttachments,
    createTaskValidator(),
    validate,
    createTask,
  );

router
  .route("/:projectId/labels")
  .get(validateProjectPermission(AvailableUserRole), getProjectLabels);

router
  .route("/:projectId/t/:taskId/activity")
  .get(validateProjectPermission(AvailableUserRole), getTaskActivity);

router
  .route("/:projectId/t/:taskId")
  .get(validateProjectPermission(AvailableUserRole), getTaskById)
  .put(
    validateProjectPermission(TASK_MANAGERS),
    broadcast,
    uploadAttachments,
    updateTaskValidator(),
    validate,
    updateTask,
  )
  .delete(validateProjectPermission(TASK_MANAGERS), broadcast, deleteTask);

router
  .route("/:projectId/t/:taskId/attachments/:attachmentId")
  .delete(
    validateProjectPermission(TASK_MANAGERS),
    broadcast,
    deleteAttachment,
  );

router
  .route("/:projectId/t/:taskId/subtasks")
  .post(
    validateProjectPermission(TASK_MANAGERS),
    broadcast,
    createSubtaskValidator(),
    validate,
    createSubTask,
  );

router
  .route("/:projectId/st/:subTaskId")
  .put(
    // Members may toggle completion; the controller blocks other edits
    validateProjectPermission(AvailableUserRole),
    broadcast,
    updateSubtaskValidator(),
    validate,
    updateSubTask,
  )
  .delete(validateProjectPermission(TASK_MANAGERS), broadcast, deleteSubTask);

// Comments: every member can read and write; ownership is checked inside
router
  .route("/:projectId/t/:taskId/comments")
  .get(validateProjectPermission(AvailableUserRole), getTaskComments)
  .post(
    validateProjectPermission(AvailableUserRole),
    broadcast,
    commentValidator(),
    validate,
    addTaskComment,
  );

router
  .route("/:projectId/comments/:commentId")
  .put(
    validateProjectPermission(AvailableUserRole),
    broadcast,
    commentValidator(),
    validate,
    updateTaskComment,
  )
  .delete(
    validateProjectPermission(AvailableUserRole),
    broadcast,
    deleteTaskComment,
  );

export default router;
