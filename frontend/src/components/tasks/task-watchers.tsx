import { EyeIcon, EyeOffIcon } from "lucide-react";

import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useCurrentUser } from "@/features/auth/hooks";
import { useWatchTask } from "@/features/tasks/hooks";
import { displayName } from "@/lib/format";
import type { UserSummary } from "@/types/models";

/**
 * Watch toggle for a task. Watchers get in-app notifications when the status
 * changes, someone comments or links it, and when it's due or overdue.
 */
export function TaskWatchers({
  projectId,
  taskId,
  watchers,
}: {
  projectId: string;
  taskId: string;
  watchers: UserSummary[];
}) {
  const { data: currentUser } = useCurrentUser();
  const watch = useWatchTask(projectId, taskId);
  const isWatching = watchers.some((user) => user._id === currentUser?._id);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={isWatching ? "text-foreground" : "text-muted-foreground"}
          aria-label={`${watchers.length} watching`}
        >
          {isWatching ? <EyeIcon /> : <EyeOffIcon />}
          <span className="tabular-nums">{watchers.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <Button
          className="w-full"
          variant={isWatching ? "outline" : "default"}
          size="sm"
          disabled={watch.isPending}
          onClick={() => watch.mutate(!isWatching)}
        >
          {watch.isPending ? (
            <Spinner />
          ) : isWatching ? (
            <EyeOffIcon />
          ) : (
            <EyeIcon />
          )}
          {isWatching ? "Stop watching" : "Watch this task"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Watchers are notified in the app about status changes, comments, links
          and due dates.
        </p>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {watchers.length === 0
              ? "Nobody is watching"
              : `Watching (${watchers.length})`}
          </p>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {watchers.map((user) => (
              <li key={user._id} className="flex items-center gap-2 text-sm">
                <UserAvatar user={user} size="sm" />
                <span className="truncate">
                  {displayName(user)}
                  {user._id === currentUser?._id && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
