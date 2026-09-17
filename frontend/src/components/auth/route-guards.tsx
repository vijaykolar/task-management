import { Navigate, Outlet, useLocation } from "react-router";

import { FullPageLoader } from "@/components/common/full-page-loader";
import { useCurrentUser } from "@/features/auth/hooks";

export interface RedirectState {
  from?: string;
}

/**
 * Renders child routes only for logged-in users. Anything other than a
 * confirmed session sends you to the login page: not signed in, an expired
 * session, or an unreachable API (the login form reports the problem there).
 */
export function RequireAuth() {
  const location = useLocation();
  const { data: user, isPending } = useCurrentUser();

  if (isPending) return <FullPageLoader />;

  if (!user) {
    const state: RedirectState = {
      from: location.pathname + location.search,
    };
    return <Navigate to="/login" replace state={state} />;
  }

  return <Outlet />;
}

/** Renders child routes only when logged out (login, register, …) */
export function GuestOnly() {
  const { data: user, isPending } = useCurrentUser();

  if (isPending) return <FullPageLoader />;
  if (user) return <Navigate to="/" replace />;

  return <Outlet />;
}
