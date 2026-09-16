import { Navigate, Outlet, useLocation } from "react-router";

import { FullPageLoader } from "@/components/common/full-page-loader";
import { QueryError } from "@/components/common/query-error";
import { useCurrentUser } from "@/features/auth/hooks";

export interface RedirectState {
  from?: string;
}

/** Renders child routes only for logged-in users */
export function RequireAuth() {
  const location = useLocation();
  const {
    data: user,
    isPending,
    error,
    refetch,
    isRefetching,
  } = useCurrentUser();

  if (isPending) return <FullPageLoader />;

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-md">
          <QueryError
            title="Can't reach the server"
            error={error}
            onRetry={() => refetch()}
            isRetrying={isRefetching}
          />
        </div>
      </div>
    );
  }

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
