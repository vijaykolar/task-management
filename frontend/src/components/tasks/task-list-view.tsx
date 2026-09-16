import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ListTodoIcon,
  MessageSquareIcon,
  UserRoundIcon,
} from "lucide-react";
import { useState } from "react";

import { PaginationControls } from "@/components/common/pagination-controls";
import { QueryError } from "@/components/common/query-error";
import { UserAvatar } from "@/components/common/user-avatar";
import {
  DueDateBadge,
  LabelList,
  PriorityIcon,
} from "@/components/tasks/task-fields";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TaskSort } from "@/features/tasks/api";
import { useTaskPage, type TaskFilters } from "@/features/tasks/hooks";
import { useSprints } from "@/features/sprints/hooks";
import { displayName, formatRelative } from "@/lib/format";
import { taskPriorityMeta } from "@/lib/task-priority";
import { cn } from "@/lib/utils";
import type { SortOrder } from "@/types/models";

const PAGE_SIZE = 25;

interface TaskListViewProps {
  projectId: string;
  filters: TaskFilters;
  onOpenTask: (taskId: string) => void;
}

function SortableHead({
  label,
  field,
  sort,
  order,
  onSort,
  className,
}: {
  label: string;
  field: TaskSort;
  sort: TaskSort;
  order: SortOrder;
  onSort: (field: TaskSort) => void;
  className?: string;
}) {
  const active = sort === field;
  const Icon = !active
    ? ArrowUpDownIcon
    : order === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon;
  return (
    <TableHead
      className={className}
      aria-sort={
        active ? (order === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <Button
        variant="ghost"
        size="xs"
        className={cn("-ml-2 font-medium", !active && "text-muted-foreground")}
        onClick={() => onSort(field)}
      >
        {label}
        <Icon className="size-3" />
      </Button>
    </TableHead>
  );
}

/** Table of tasks with sortable columns and pages (uses the panel's filters) */
export function TaskListView({
  projectId,
  filters,
  onOpenTask,
}: TaskListViewProps) {
  // Column sorting here overrides the toolbar sort
  const [sort, setSort] = useState<TaskSort>(filters.sort ?? "createdAt");
  const [order, setOrder] = useState<SortOrder>(filters.order ?? "desc");
  const [page, setPage] = useState(1);
  const sprints = useSprints(projectId);

  const tasks = useTaskPage(projectId, {
    ...filters,
    sort,
    order,
    page,
    limit: PAGE_SIZE,
  });

  const sprintName = (sprintId?: string) =>
    sprintId
      ? (sprints.data?.sprints.find((s) => s._id === sprintId)?.name ??
        "Sprint")
      : "Backlog";

  const handleSort = (field: TaskSort) => {
    if (field === sort) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(field);
      setOrder(field === "title" || field === "dueDate" ? "asc" : "desc");
    }
    setPage(1);
  };

  const items = tasks.data?.items ?? [];
  const headProps = { sort, order, onSort: handleSort };

  if (tasks.isError) {
    return (
      <QueryError
        title="Couldn't load tasks"
        error={tasks.error}
        onRetry={() => tasks.refetch()}
        isRetrying={tasks.isRefetching}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="overflow-x-auto rounded-xl border transition-opacity data-[stale=true]:opacity-60"
        data-stale={tasks.isPlaceholderData}
      >
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <SortableHead
                label="Priority"
                field="priority"
                className="w-24"
                {...headProps}
              />
              <SortableHead
                label="Title"
                field="title"
                className="min-w-64"
                {...headProps}
              />
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-40">Assignee</TableHead>
              <SortableHead
                label="Due"
                field="dueDate"
                className="w-28"
                {...headProps}
              />
              <TableHead className="hidden w-32 lg:table-cell">
                Sprint
              </TableHead>
              <TableHead className="hidden w-40 xl:table-cell">
                Labels
              </TableHead>
              <SortableHead
                label="Updated"
                field="updatedAt"
                className="hidden w-28 md:table-cell"
                {...headProps}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.isPending &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {items.map((task) => (
              <TableRow
                key={task._id}
                className="cursor-pointer"
                onClick={() => onOpenTask(task._id)}
              >
                <TableCell>
                  <span className="flex items-center gap-1.5 text-xs">
                    <PriorityIcon priority={task.priority} />
                    <span className="hidden sm:inline">
                      {taskPriorityMeta[task.priority].label}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  {/* Real button for keyboard users; the row is clickable too */}
                  <button
                    type="button"
                    className={cn(
                      "max-w-md truncate text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none",
                      task.status === "done" &&
                        "text-muted-foreground line-through",
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenTask(task._id);
                    }}
                  >
                    {task.title}
                  </button>
                  {task.commentCount > 0 && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                      <MessageSquareIcon className="size-3" />
                      {task.commentCount}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <TaskStatusBadge status={task.status} />
                </TableCell>
                <TableCell>
                  {task.assignedTo ? (
                    <span className="flex items-center gap-2">
                      <UserAvatar user={task.assignedTo} size="sm" />
                      <span className="truncate">
                        {displayName(task.assignedTo)}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <UserRoundIcon className="size-4" />
                      Unassigned
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {task.dueDate ? (
                    <DueDateBadge
                      dueDate={task.dueDate}
                      done={task.status === "done"}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {sprintName(task.sprint)}
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <LabelList labels={task.labels} max={2} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {formatRelative(task.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {tasks.isSuccess && items.length === 0 && (
          <Empty className="rounded-none border-t py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListTodoIcon />
              </EmptyMedia>
              <EmptyTitle>No tasks found</EmptyTitle>
              <EmptyDescription>
                Try changing the filters or the sprint selection.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <PaginationControls
        pagination={tasks.data?.pagination}
        onPageChange={setPage}
        isFetching={tasks.isFetching}
        itemLabel="tasks"
      />
    </div>
  );
}
