import express, { type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import helmet from "helmet";
import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/error.middleware.js";

const app = express();

// Behind a reverse proxy / load balancer, set TRUST_PROXY (e.g. "1") so rate
// limiting sees the real client IP instead of the proxy's
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
}

// Security headers. Attachments in /images are embedded by the frontend,
// which runs on another origin, so allow cross-origin resource loading.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// basic configurations
// Rich text (notes, comments) is HTML, so allow larger JSON bodies
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());
app.use(morgan("dev"));

// cors configurations
console.log(process.env.CORS_ORIGIN);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

//  import the routes

import healthCheckRouter from "./routes/healthcheck.routes.js";
import authRouter from "./routes/auth.routes.js";
import automationRouter from "./routes/automation.routes.js";
import projectRouter from "./routes/project.routes.js";
import taskRouter from "./routes/task.routes.js";
import noteRouter from "./routes/note.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import sprintRouter from "./routes/sprint.routes.js";
import reportRouter from "./routes/report.routes.js";
import searchRouter from "./routes/search.routes.js";
import eventsRouter from "./routes/events.routes.js";

app.use("/api/v1/healthcheck", healthCheckRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/projects", projectRouter);
app.use("/api/v1/tasks", taskRouter);
app.use("/api/v1/notes", noteRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/sprints", sprintRouter);
app.use("/api/v1/automations", automationRouter);
app.use("/api/v1/reports", reportRouter);
app.use("/api/v1/search", searchRouter);
app.use("/api/v1/events", eventsRouter);

app.get("/", (req: Request, res: Response) => {
  res.send("Welcome to project management");
});

// Must be registered after all routes
app.use("/api", notFoundHandler);
app.use(errorHandler);

export default app;
