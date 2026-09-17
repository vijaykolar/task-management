import { HistoryIcon } from "lucide-react";
import type { ReactNode } from "react";

import { UserAvatar } from "@/components/common/user-avatar";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { PriorityIcon } from "@/components/tasks/task-fields";
import { TaskTypeIcon } from "@/components/tasks/task-type";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useTaskActivity } from "@/features/tasks/hooks";
import { formatDueDate } from "@/lib/due-date";
import { displayName, formatDate, formatRelative } from "@/lib/format";
import { formatPoints } from "@/lib/story-points";
import { taskPriorityMeta } from "@/lib/task-priority";
import { taskTypeMeta } from "@/lib/task-type";
import {
  AvailableTaskPriorities,
  AvailableTaskTypes,
  type TaskActivity,
  type TaskPriority,
  type TaskType,
} from "@/types/models";

const Strong = ({ children }: { children: ReactNode }) => (
  <span className="font-medium text-foreground">{children}</span>
);

const isStatusKey = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isTaskType = (value: unknown): value is TaskType =>
  AvailableTaskTypes.includes(value as TaskType);

/** `{ key, name }` snapshot of a linked task or epic */
const taskRefLabel = (value: unknown) => {
  if (!value || typeof value !== "object") return null;
  const { key, name } = value as { key?: string; name?: string };
  return [key, name].filter(Boolean).join(" ") || null;
};

const LINK_PHRASES: Record<string, string> = {
  blocks: "blocks",
  "blocks:inward": "is blocked by",
  relates_to: "relates to",
  "relates_to:inward": "relates to",
  duplicates: "duplicates",
  "duplicates:inward": "is duplicated by",
};

const isPriority = (value: unknown): value is TaskPriority =>
  AvailableTaskPriorities.includes(value as TaskPriority);

const personName = (value: unknown) =>
  value && typeof value === "object" && "name" in value
    ? String((value as { name: string }).name)
    : null;

const asLabels = (value: unknown) =>
  Array.isArray(value) ? value.map(String) : [];

function Priority({ value }: { value: unknown }) {
  if (!isPriority(value)) return <Strong>{String(value)}</Strong>;
  return (
    <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
      <PriorityIcon priority={value} className="size-3.5" />
      {taskPriorityMeta[value].label}
    </span>
  );
}

function TypeName({ value }: { value: unknown }) {
  if (!isTaskType(value)) return <Strong>{String(value)}</Strong>;
  return (
    <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
      <TaskTypeIcon type={value} className="size-3.5" />
      {taskTypeMeta[value].label}
    </span>
  );
}

/** Human sentence for one history entry, e.g. "changed status from To do to Done" */
function describe(entry: TaskActivity, projectId: string): ReactNode {
  const { type, from, to, name } = entry;

  switch (type) {
    case "created":
      return "created this task";
    case "title_changed":
      return (
        <>
          renamed this from <Strong>“{String(from)}”</Strong> to{" "}
          <Strong>“{String(to)}”</Strong>
        </>
      );
    case "description_changed":
      return "updated the description";
    case "status_changed":
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          changed status
          {isStatusKey(from) && (
            <TaskStatusBadge status={from} projectId={projectId} />
          )}
          →
          {isStatusKey(to) && (
            <TaskStatusBadge status={to} projectId={projectId} />
          )}
          {name === "status_removed" && " when its status was removed"}
        </span>
      );
    case "priority_changed":
      return (
        <>
          changed priority from <Priority value={from} /> to{" "}
          <Priority value={to} />
        </>
      );
    case "assignee_changed": {
      const fromName = personName(from);
      const toName = personName(to);
      if (!toName) {
        return (
          <>
            unassigned <Strong>{fromName ?? "someone"}</Strong>
          </>
        );
      }
      if (!fromName) {
        return (
          <>
            assigned this to <Strong>{toName}</Strong>
          </>
        );
      }
      return (
        <>
          reassigned this from <Strong>{fromName}</Strong> to{" "}
          <Strong>{toName}</Strong>
        </>
      );
    }
    case "due_date_changed":
      if (!to) return "removed the due date";
      if (!from) {
        return (
          <>
            set the due date to <Strong>{formatDueDate(String(to))}</Strong>
          </>
        );
      }
      return (
        <>
          changed the due date from{" "}
          <Strong>{formatDueDate(String(from))}</Strong> to{" "}
          <Strong>{formatDueDate(String(to))}</Strong>
        </>
      );
    case "labels_changed": {
      const before = asLabels(from);
      const after = asLabels(to);
      const added = after.filter((label) => !before.includes(label));
      const removed = before.filter((label) => !after.includes(label));
      return (
        <>
          {added.length > 0 && (
            <>
              added {added.length === 1 ? "label" : "labels"}{" "}
              <Strong>{added.join(", ")}</Strong>
            </>
          )}
          {added.length > 0 && removed.length > 0 && " and "}
          {removed.length > 0 && (
            <>
              removed {removed.length === 1 ? "label" : "labels"}{" "}
              <Strong>{removed.join(", ")}</Strong>
            </>
          )}
          {added.length === 0 && removed.length === 0 && "updated the labels"}
        </>
      );
    }
    case "attachment_added":
      return (
        <>
          attached <Strong>{name}</Strong>
        </>
      );
    case "attachment_removed":
      return (
        <>
          removed the attachment <Strong>{name}</Strong>
        </>
      );
    case "subtask_added":
      return (
        <>
          added the subtask <Strong>“{name}”</Strong>
        </>
      );
    case "subtask_completed":
      return (
        <>
          completed the subtask <Strong>“{name}”</Strong>
        </>
      );
    case "subtask_reopened":
      return (
        <>
          reopened the subtask <Strong>“{name}”</Strong>
        </>
      );
    case "subtask_deleted":
      return (
        <>
          deleted the subtask <Strong>“{name}”</Strong>
        </>
      );
    case "comment_added":
      return "commented";
    case "sprint_changed": {
      const fromName = personName(from);
      const toName = personName(to);
      if (name === "created") {
        return (
          <>
            added this to <Strong>{toName ?? "Backlog"}</Strong>
          </>
        );
      }
      return (
        <>
          moved this from <Strong>{fromName ?? "Backlog"}</Strong> to{" "}
          <Strong>{toName ?? "Backlog"}</Strong>
          {name === "sprint_completed" && " when the sprint was completed"}
          {name === "sprint_deleted" && " when the sprint was deleted"}
        </>
      );
    }
    case "type_changed":
      return (
        <>
          changed the type from <TypeName value={from} /> to{" "}
          <TypeName value={to} />
        </>
      );
    case "epic_changed": {
      const fromEpic = taskRefLabel(from);
      const toEpic = taskRefLabel(to);
      if (!toEpic) {
        return (
          <>
            removed this from the epic <Strong>{fromEpic ?? "an epic"}</Strong>
          </>
        );
      }
      return (
        <>
          {name === "created" ? "added this to" : "moved this to"} the epic{" "}
          <Strong>{toEpic}</Strong>
        </>
      );
    }
    case "link_added":
    case "link_removed": {
      const phrase = LINK_PHRASES[name ?? ""] ?? "is linked to";
      return (
        <>
          {type === "link_added" ? "linked" : "removed the link"}: this {phrase}{" "}
          <Strong>{taskRefLabel(to) ?? "a deleted task"}</Strong>
        </>
      );
    }
    case "points_changed": {
      const points = (value: unknown) =>
        typeof value === "number" ? formatPoints(value) : null;
      if (points(to) === null) return "removed the story point estimate";
      if (points(from) === null) {
        return (
          <>
            estimated this at <Strong>{points(to)}</Strong>
          </>
        );
      }
      return (
        <>
          changed story points from <Strong>{points(from)}</Strong> to{" "}
          <Strong>{points(to)}</Strong>
        </>
      );
    }
    default:
      return "updated this task";
  }
}

export function TaskActivityList({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const activity = useTaskActivity(projectId, taskId);
  const entries = activity.data?.pages.flatMap((page) => page.items) ?? [];

  if (activity.isPending) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (activity.isError) {
    return <p className="text-sm text-destructive">{activity.error.message}</p>;
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <HistoryIcon className="size-4" />
        No history yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-px before:bg-border">
        {entries.map((entry) => (
          <li key={entry._id} className="relative flex gap-3">
            {entry.actor ? (
              <UserAvatar
                user={entry.actor}
                size="sm"
                className="ring-2 ring-background"
              />
            ) : (
              <span className="size-6 shrink-0 rounded-full bg-muted ring-2 ring-background" />
            )}
            <div className="min-w-0 flex-1 pt-0.5 text-sm text-muted-foreground">
              <Strong>
                {entry.actor ? displayName(entry.actor) : "Someone"}
              </Strong>{" "}
              {describe(entry, projectId)}
              <time
                className="ml-1.5 text-xs whitespace-nowrap"
                dateTime={entry.createdAt}
                title={formatDate(entry.createdAt)}
              >
                · {formatRelative(entry.createdAt)}
              </time>
            </div>
          </li>
        ))}
      </ol>

      {activity.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => activity.fetchNextPage()}
          disabled={activity.isFetchingNextPage}
        >
          {activity.isFetchingNextPage && <Spinner />}
          Show older history
        </Button>
      )}
    </div>
  );
}
