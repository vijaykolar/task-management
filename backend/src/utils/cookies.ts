import type { CookieOptions } from "express";

type SameSite = "strict" | "lax" | "none";

const sameSite = (): SameSite => {
  const value = process.env.COOKIE_SAME_SITE?.toLowerCase();
  return value === "strict" || value === "none" ? value : "lax";
};

/**
 * Options for the auth cookies. `lax` blocks cross-site POSTs (CSRF) while
 * still working when the frontend and API share a site. Use
 * COOKIE_SAME_SITE=none only when they live on different sites.
 */
export const authCookieOptions = (): CookieOptions => {
  const policy = sameSite();
  return {
    httpOnly: true,
    // Browsers require Secure for SameSite=None; localhost counts as secure
    secure: policy === "none" || process.env.COOKIE_SECURE !== "false",
    sameSite: policy,
    path: "/",
  };
};
