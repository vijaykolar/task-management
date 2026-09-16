import rateLimit, { type Options } from "express-rate-limit";
import { ApiError } from "../utils/api-error.js";

const MINUTE = 60 * 1000;

// Note: counters live in memory. Behind multiple API instances, configure a
// shared store (e.g. rate-limit-redis) so limits apply across all of them.
const createLimiter = (
  options: Partial<Options> & { windowMs: number; limit: number },
) =>
  rateLimit({
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Reply through the global error handler so clients get the JSON shape
    handler: (req, res, next, opts) => {
      const minutes = Math.ceil(opts.windowMs / MINUTE);
      next(
        new ApiError(
          429,
          `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        ),
      );
    },
    ...options,
  });

const emailKey = (prefix: string) => (req: { body?: { email?: unknown } }) =>
  `${prefix}:${typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""}`;

/** Per IP: slows down credential stuffing from one source */
export const loginIpLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 30,
  skipSuccessfulRequests: true,
});

/** Per account: stops brute-forcing one account from many IPs */
export const loginAccountLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: emailKey("login"),
});

/** Emails cost money and can be used to spam someone's inbox */
export const emailSendingLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 5,
});

/** Adding members may send notification / invitation emails */
export const inviteLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 30,
});

export const registerLimiter = createLimiter({
  windowMs: 60 * MINUTE,
  limit: 10,
});

/** Password changes / resets: guess protection for old passwords and tokens */
export const passwordLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
});
