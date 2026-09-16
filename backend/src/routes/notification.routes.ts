import { Router } from "express";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notification.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(verifyJWT);

router.route("/").get(getNotifications);
router.route("/read-all").post(markAllNotificationsRead);
router.route("/:notificationId/read").patch(markNotificationRead);

export default router;
