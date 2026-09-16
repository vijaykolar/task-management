import { BellIcon, CheckCheckIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { PageHeader } from "@/components/common/page-header";
import { PaginationControls } from "@/components/common/pagination-controls";
import { QueryError } from "@/components/common/query-error";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/features/notifications/hooks";

const PAGE_SIZE = 20;

export function NotificationsPage() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);

  const notifications = useNotifications({
    page,
    limit: PAGE_SIZE,
    unread: filter === "unread",
  });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          <>
            Assignments, comments on your tasks and @mentions. Email preferences
            are in{" "}
            <Link to="/account" className="underline underline-offset-4">
              account settings
            </Link>
            .
          </>
        }
        actions={
          unread > 0 && (
            <Button
              variant="outline"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheckIcon />
              Mark all as read
            </Button>
          )
        }
      />

      <Tabs
        value={filter}
        onValueChange={(value) => {
          setFilter(value as "all" | "unread");
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">
            Unread
            {unread > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
                {unread}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {notifications.isError ? (
        <QueryError
          title="Couldn't load notifications"
          error={notifications.error}
          onRetry={() => notifications.refetch()}
          isRetrying={notifications.isRefetching}
        />
      ) : notifications.isPending ? (
        <Card>
          <CardContent className="space-y-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellIcon />
            </EmptyMedia>
            <EmptyTitle>
              {filter === "unread"
                ? "No unread notifications"
                : "No notifications yet"}
            </EmptyTitle>
            <EmptyDescription>
              You&apos;ll be notified when someone assigns you a task, comments
              on your tasks or mentions you.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Card className="py-2">
            <CardContent className="divide-y px-2">
              {items.map((notification) => (
                <NotificationItem
                  key={notification._id}
                  notification={notification}
                  onOpen={(n) => {
                    if (!n.readAt) markRead.mutate(n._id);
                  }}
                />
              ))}
            </CardContent>
          </Card>
          <PaginationControls
            pagination={notifications.data?.pagination}
            onPageChange={setPage}
            isFetching={notifications.isFetching}
            itemLabel="notifications"
          />
        </>
      )}
    </>
  );
}
