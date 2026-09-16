import jwt, { type JwtPayload } from "jsonwebtoken";
import { asyncHandler } from "../utils/async-handler.js";
import { addClient, removeClient, writeEvent } from "../utils/realtime.js";
import { requireUser } from "../utils/request-user.js";

const HEARTBEAT_MS = 25_000;

/**
 * GET /events — Server-Sent Events stream for the signed-in user.
 * The stream closes when the access token expires; the browser reconnects
 * (refreshing its session first), so revoked sessions stop receiving events.
 */
export const streamEvents = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const userId = String(user._id);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Stop reverse proxies (nginx) from buffering the stream
    "X-Accel-Buffering": "no",
  });
  // Tell EventSource how long to wait before reconnecting
  res.write("retry: 5000\n\n");
  writeEvent(res, { type: "connected" });
  addClient(userId, res);

  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  const token: unknown =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");
  const exp =
    typeof token === "string"
      ? (jwt.decode(token) as JwtPayload | null)?.exp
      : undefined;
  const expiry = exp
    ? setTimeout(() => res.end(), Math.max(exp * 1000 - Date.now(), 0))
    : undefined;

  req.on("close", () => {
    clearInterval(heartbeat);
    if (expiry) clearTimeout(expiry);
    removeClient(userId, res);
  });
});
