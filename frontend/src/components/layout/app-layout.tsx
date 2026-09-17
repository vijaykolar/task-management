import { Outlet } from "react-router";

import { AppBreadcrumbs } from "@/components/layout/app-breadcrumbs";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { EmailVerificationBanner } from "@/components/layout/email-verification-banner";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { GlobalSearch } from "@/components/search/global-search";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useCurrentUser, useSyncTimeZone } from "@/features/auth/hooks";
import { useRealtimeConnection } from "@/features/realtime/use-realtime-connection";

/** Shell for authenticated pages. Rendered inside <RequireAuth />. */
export function AppLayout() {
  const { data: user } = useCurrentUser();
  useRealtimeConnection(user?._id);
  // Due date reminders follow the browser's time zone
  useSyncTimeZone(user ?? undefined);
  if (!user) return null;

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-backdrop-filter:bg-background/60">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <AppBreadcrumbs />
          <div className="ml-auto flex items-center gap-1">
            <GlobalSearch />
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>
        {!user.isEmailVerified && (
          <EmailVerificationBanner email={user.email} />
        )}
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
