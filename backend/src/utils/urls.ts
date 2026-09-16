import type { Request } from "express";

/** First CORS origin, i.e. where the frontend runs. Used for links in emails. */
export const frontendUrl = () =>
  process.env.CORS_ORIGIN?.split(",")[0]?.trim() || "http://localhost:5173";

/** Public base URL of this API, for links to uploaded files */
export const serverUrl = (req: Request<any>) =>
  process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`;
