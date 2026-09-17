import {
  AlarmClockIcon,
  AtSignIcon,
  BellIcon,
  CalendarClockIcon,
  Link2Icon,
  MessageSquareIcon,
  RefreshCwIcon,
  UserPlusIcon,
  WandSparklesIcon,
} from "lucide-react";
import { Link } from "react-router";

import { UserAvatar } from "@/components/common/user-avatar";
import { notificationHref } from "@/features/notifications/hooks";
import { displayName, formatDate, formatRelative } from "@/lib/format";
import { notificationParts } from "@/lib/notification-text";
import { cn } from "@/lib/utils";
import type { AppNotification, NotificationType } from "@/types/models";

const typeMeta: Record<
  NotificationType,
  { icon: typeof AtSignIcon; className: string }
> = {
  task_assigned: { icon: UserPlusIcon, className: "bg-sky-500 text-white" },
  task_commented: {
    icon: MessageSquareIcon,
    className: "bg-emerald-500 text-white",
  },
  mentioned: { icon: AtSignIcon, className: "bg-violet-500 text-white" },
  task_status_changed: {
    icon: RefreshCwIcon,
    className: "bg-sky-600 text-white",
  },
  task_linked: { icon: Link2Icon, className: "bg-slate-500 text-white" },
  task_due_soon: {
    icon: CalendarClockIcon,
    className: "bg-amber-500 text-white",
  },
  task_overdue: { icon: AlarmClockIcon, className: "bg-red-500 text-white" },
  automation: {
    icon: WandSparklesIcon,
    className: "bg-indigo-500 text-white",
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
  const meta = typeMeta[notification.type] ?? typeMeta.task_status_changed;
  const Icon = meta.icon;
  const parts = notificationParts({
    type: notification.type,
    actorName: notification.actor ? displayName(notification.actor) : undefined,
    taskKey: notification.taskKey,
    taskTitle: notification.taskTitle,
  });
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
          // Reminders come from the app, not a person
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <BellIcon className="size-4" />
          </span>
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
          {parts.actor && (
            <>
              <span className="font-medium text-foreground">
                {parts.actor}
              </span>{" "}
            </>
          )}
          {parts.verb && <>{parts.verb} </>}
          <span className="font-medium text-foreground">{parts.task}</span>
          {parts.suffix && <> {parts.suffix}</>}
        </span>
        {notification.excerpt && (
          <span
            className={cn(
              "block text-muted-foreground",
              compact ? "line-clamp-1" : "line-clamp-2",
            )}
          >
            {notification.type === "task_commented" ||
            notification.type === "mentioned"
              ? `“${notification.excerpt}”`
              : notification.excerpt}
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
