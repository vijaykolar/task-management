import { Router } from "express";
import { streamEvents } from "../controllers/events.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/").get(verifyJWT, streamEvents);

export default router;
