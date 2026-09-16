import { BellIcon, CheckCheckIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { NotificationItem } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtimeStatus } from "@/features/realtime/realtime";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/features/notifications/hooks";

/** Header bell: unread badge + the latest notifications */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  // Live updates push new notifications; poll only while disconnected
  const realtime = useRealtimeStatus();
  const notifications = useNotifications(
    { limit: 8 },
    { poll: realtime !== "open" },
  );
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unread = notifications.data?.unreadCount ?? 0;
  const items = notifications.data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread ? `Notifications (${unread} unread)` : "Notifications"
          }
        >
          <BellIcon />
          {unread > 0 && (
            <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <p className="font-heading font-semibold">Notifications</p>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheckIcon />
              Mark all read
            </Button>
          )}
        </div>
        <Separator />

        <div className="max-h-[60svh] overflow-y-auto p-1">
          {notifications.isPending &&
            Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex gap-3 p-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}

          {notifications.isSuccess && items.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
              <BellIcon className="size-6" />
              You&apos;re all caught up.
            </div>
          )}

          {items.map((notification) => (
            <NotificationItem
              key={notification._id}
              notification={notification}
              compact
              onOpen={(n) => {
                if (!n.readAt) markRead.mutate(n._id);
                setOpen(false);
              }}
            />
          ))}
        </div>

        <Separator />
        <Button
          asChild
          variant="ghost"
          className="w-full rounded-t-none"
          onClick={() => setOpen(false)}
        >
          <Link to="/notifications">View all notifications</Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
