import {
  AlarmClockIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  SearchIcon,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { PageHeader } from "@/components/common/page-header";
import { PaginationControls } from "@/components/common/pagination-controls";
import { QueryError } from "@/components/common/query-error";
import {
  DueDateBadge,
  LabelList,
  PriorityIcon,
} from "@/components/tasks/task-fields";
import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { TaskKey, TaskTypeIcon } from "@/components/tasks/task-type";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MyTaskParams } from "@/features/tasks/api";
import { useMyTasks } from "@/features/tasks/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { dueState } from "@/lib/due-date";
import { projectColor } from "@/lib/project-color";
import { cn } from "@/lib/utils";
import type { MyTask, SortOrder } from "@/types/models";

const PAGE_SIZE = 50;

type Scope = NonNullable<MyTaskParams["status"]>;
type Sort = NonNullable<MyTaskParams["sort"]>;

const groups: {
  key: string;
  label: string;
  match: (task: MyTask) => boolean;
}[] = [
  {
    key: "overdue",
    label: "Overdue",
    match: (t) =>
      t.statusCategory !== "done" && dueState(t.dueDate) === "overdue",
  },
  {
    key: "today",
    label: "Due today",
    match: (t) => dueState(t.dueDate) === "today",
  },
  {
    key: "soon",
    label: "Due soon",
    match: (t) => dueState(t.dueDate) === "soon",
  },
  { key: "later", label: "Later", match: (t) => !!t.dueDate },
  { key: "none", label: "No due date", match: () => true },
];

function Stat({
  icon: Icon,
  label,
  value,
  tone,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: string;
  loading: boolean;
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            tone,
          )}
        >
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-8" />
          ) : (
            <p className="font-heading text-xl font-semibold tabular-nums">
              {value}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TaskRow({ task }: { task: MyTask }) {
  return (
    <li>
      <Link
        to={`/projects/${task.project._id}?tab=tasks&task=${task._id}`}
        className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3"
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <PriorityIcon priority={task.priority} />
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-sm font-medium",
                task.statusCategory === "done" &&
                  "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TaskTypeIcon type={task.type} className="size-3.5" />
              <TaskKey value={task.key} />
              <span
                className={cn(
                  "ml-1 size-2 rounded-full",
                  projectColor(task.project._id),
                )}
              />
              {task.project.name}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2 pl-7 sm:pl-0">
          <LabelList labels={task.labels} max={2} className="hidden lg:flex" />
          <DueDateBadge
            dueDate={task.dueDate}
            done={task.statusCategory === "done"}
          />
          <TaskStatusBadge
            status={task.status}
            statuses={task.project.statuses}
          />
        </span>
      </Link>
    </li>
  );
}

export function MyWorkPage() {
  const [scope, setScope] = useState<Scope>("open");
  const [sort, setSort] = useState<Sort>("dueDate");
  const [order, setOrder] = useState<SortOrder>("asc");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim());

  const tasks = useMyTasks({
    status: scope,
    sort,
    order,
    search: debouncedSearch || undefined,
    page,
    limit: PAGE_SIZE,
  });

  const items = tasks.data?.items;
  const summary = tasks.data?.summary;

  // Group by due date only when sorted by due date (soonest first)
  const grouped = useMemo(() => {
    if (!items || sort !== "dueDate" || order !== "asc") return null;
    const remaining = [...items];
    return groups
      .map((group) => {
        const tasksInGroup = remaining.filter(group.match);
        for (const task of tasksInGroup)
          remaining.splice(remaining.indexOf(task), 1);
        return { ...group, tasks: tasksInGroup };
      })
      .filter((group) => group.tasks.length > 0);
  }, [items, sort, order]);

  const reset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  return (
    <>
      <PageHeader
        title="My work"
        description="Tasks assigned to you across all your projects."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={CircleDotIcon}
          label="Open"
          value={summary?.open ?? 0}
          tone="bg-sky-500/10 text-sky-600 dark:text-sky-400"
          loading={!summary}
        />
        <Stat
          icon={AlarmClockIcon}
          label="Overdue"
          value={summary?.overdue ?? 0}
          tone="bg-red-500/10 text-red-600 dark:text-red-400"
          loading={!summary}
        />
        <Stat
          icon={CalendarDaysIcon}
          label="Due this week"
          value={summary?.dueThisWeek ?? 0}
          tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          loading={!summary}
        />
        <Stat
          icon={CheckCircle2Icon}
          label="Done"
          value={summary?.done ?? 0}
          tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          loading={!summary}
        />
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <Tabs value={scope} onValueChange={(v) => reset(setScope)(v as Scope)}>
          <TabsList>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="done">Done</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <InputGroup className="lg:ml-auto lg:max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search my tasks…"
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            aria-label="Search my tasks"
          />
        </InputGroup>
        <div className="flex gap-2">
          <Select value={sort} onValueChange={(v) => reset(setSort)(v as Sort)}>
            <SelectTrigger className="flex-1 lg:w-40" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dueDate">Due date</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="updatedAt">Last updated</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => reset(setOrder)(order === "asc" ? "desc" : "asc")}
            aria-label={order === "asc" ? "Sort descending" : "Sort ascending"}
          >
            {order === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
          </Button>
        </div>
      </div>

      {tasks.isError ? (
        <QueryError
          title="Couldn't load your tasks"
          error={tasks.error}
          onRetry={() => tasks.refetch()}
          isRetrying={tasks.isRefetching}
        />
      ) : tasks.isPending ? (
        <Card>
          <CardContent className="space-y-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : !items?.length ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle2Icon />
            </EmptyMedia>
            <EmptyTitle>
              {debouncedSearch
                ? "No matching tasks"
                : scope === "open"
                  ? "You're all caught up"
                  : "No tasks here"}
            </EmptyTitle>
            <EmptyDescription>
              {scope === "open" && !debouncedSearch
                ? "Nothing is assigned to you right now."
                : "Try a different filter or search."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          className="space-y-4 transition-opacity data-[stale=true]:opacity-60"
          data-stale={tasks.isPlaceholderData}
        >
          {grouped ? (
            grouped.map((group) => (
              <section key={group.key} className="space-y-2">
                <h2
                  className={cn(
                    "flex items-center gap-2 text-sm font-medium",
                    group.key === "overdue" && "text-red-600 dark:text-red-400",
                  )}
                >
                  {group.label}
                  <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
                    {group.tasks.length}
                  </span>
                </h2>
                <Card className="py-0">
                  <ul className="divide-y">
                    {group.tasks.map((task) => (
                      <TaskRow key={task._id} task={task} />
                    ))}
                  </ul>
                </Card>
              </section>
            ))
          ) : (
            <Card className="py-0">
              <ul className="divide-y">
                {items.map((task) => (
                  <TaskRow key={task._id} task={task} />
                ))}
              </ul>
            </Card>
          )}
          <PaginationControls
            pagination={tasks.data?.pagination}
            onPageChange={setPage}
            isFetching={tasks.isFetching}
            itemLabel="tasks"
          />
        </div>
      )}
    </>
  );
}
