import { Router } from "express";
import { globalSearch } from "../controllers/search.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/").get(verifyJWT, globalSearch);

export default router;
