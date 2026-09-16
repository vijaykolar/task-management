import { AtSignIcon, MessageSquareIcon, UserPlusIcon } from "lucide-react";
import { Link } from "react-router";

import { UserAvatar } from "@/components/common/user-avatar";
import { notificationHref } from "@/features/notifications/hooks";
import { displayName, formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppNotification, NotificationType } from "@/types/models";

const typeMeta: Record<
  NotificationType,
  { icon: typeof AtSignIcon; verb: string; className: string }
> = {
  task_assigned: {
    icon: UserPlusIcon,
    verb: "assigned you to",
    className: "bg-sky-500 text-white",
  },
  task_commented: {
    icon: MessageSquareIcon,
    verb: "commented on",
    className: "bg-emerald-500 text-white",
  },
  mentioned: {
    icon: AtSignIcon,
    verb: "mentioned you in",
    className: "bg-violet-500 text-white",
  },
};

interface NotificationItemProps {
  notification: AppNotification;
  onOpen: (notification: AppNotification) => void;
  compact?: boolean;
}

export function NotificationItem({
  notification,
  onOpen,
  compact,
}: NotificationItemProps) {
  const meta = typeMeta[notification.type];
  const Icon = meta.icon;
  const isUnread = !notification.readAt;

  return (
    <Link
      to={notificationHref(notification)}
      onClick={() => onOpen(notification)}
      className={cn(
        "flex gap-3 rounded-lg p-3 text-sm transition-colors hover:bg-muted/60",
        isUnread && "bg-primary/5",
      )}
    >
      <span className="relative shrink-0">
        {notification.actor ? (
          <UserAvatar user={notification.actor} />
        ) : (
          <span className="block size-8 rounded-full bg-muted" />
        )}
        <span
          className={cn(
            "absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full ring-2 ring-background",
            meta.className,
          )}
        >
          <Icon className="size-2.5" />
        </span>
      </span>

      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">
            {notification.actor ? displayName(notification.actor) : "Someone"}
          </span>{" "}
          {meta.verb}{" "}
          <span className="font-medium text-foreground">
            {notification.taskTitle ?? "a task"}
          </span>
        </span>
        {notification.excerpt && (
          <span
            className={cn(
              "block text-muted-foreground",
              compact ? "line-clamp-1" : "line-clamp-2",
            )}
          >
            “{notification.excerpt}”
          </span>
        )}
        <span className="block text-xs text-muted-foreground">
          {notification.projectName} ·{" "}
          <time
            dateTime={notification.createdAt}
            title={formatDate(notification.createdAt)}
          >
            {formatRelative(notification.createdAt)}
          </time>
        </span>
      </span>

      {isUnread && (
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
          aria-label="Unread"
        />
      )}
    </Link>
  );
}
