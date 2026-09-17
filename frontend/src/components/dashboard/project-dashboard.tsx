import { format, parseISO } from "date-fns";
import {
  AlertTriangleIcon,
  CircleDotIcon,
  InboxIcon,
  LayoutDashboardIcon,
  UserRoundXIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import { QueryError } from "@/components/common/query-error";
import { TaskKey } from "@/components/tasks/task-type";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectDashboard } from "@/features/reports/hooks";
import { displayName } from "@/lib/format";
import { statusCategoryMeta } from "@/lib/task-status";
import { taskTypeMeta } from "@/lib/task-type";
import { cn } from "@/lib/utils";
import {
  AvailableTaskTypes,
  type ProjectDashboard as DashboardData,
  type TaskType,
} from "@/types/models";

// Categorical slots 1 and 2, validated for colour-vision deficiency in both
// themes (same pair as the sprint reports)
const BLUE = { light: "#2a78d6", dark: "#3987e5" };
const ORANGE = { light: "#eb6834", dark: "#d95926" };

const RANGES = [7, 14, 30, 90] as const;
const ALL_WORK = "all";

const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const;

/**
 * Project dashboard: headline numbers, created vs resolved over time, open
 * work per person and per status, and epic progress.
 */
export function ProjectDashboard({
  projectId,
  onOpenTask,
  className,
}: {
  projectId: string;
  /** Opens an epic from the progress list */
  onOpenTask: (taskId: string) => void;
  className?: string;
}) {
  const [days, setDays] = useState<number>(30);
  const [type, setType] = useState<TaskType | typeof ALL_WORK>(ALL_WORK);
  const dashboard = useProjectDashboard(projectId, {
    days,
    type: type === ALL_WORK ? undefined : type,
  });
  const data = dashboard.data;

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <LayoutDashboardIcon className="size-4 text-muted-foreground" />
          <h2 className="font-heading text-lg font-semibold">Dashboard</h2>
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <Select
            value={type}
            onValueChange={(value) => setType(value as typeof type)}
          >
            <SelectTrigger className="w-36" aria-label="Issue type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_WORK}>All work</SelectItem>
              {AvailableTaskTypes.filter((t) => t !== "epic").map((t) => (
                <SelectItem key={t} value={t}>
                  {taskTypeMeta[t].label}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(days)}
            onValueChange={(value) => setDays(Number(value))}
          >
            <SelectTrigger className="w-36" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((range) => (
                <SelectItem key={range} value={String(range)}>
                  Last {range} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {dashboard.isError ? (
        <QueryError
          title="Couldn't load the dashboard"
          error={dashboard.error}
          onRetry={() => dashboard.refetch()}
          isRetrying={dashboard.isRefetching}
        />
      ) : !data ? (
        <DashboardSkeleton />
      ) : (
        <div
          className="space-y-4 transition-opacity data-[stale=true]:opacity-60"
          data-stale={dashboard.isPlaceholderData}
        >
          <StatTiles data={data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CreatedVsResolvedCard data={data} />
            <WorkloadCard data={data} />
            <StatusCard data={data} />
            <EpicProgressCard data={data} onOpenTask={onOpenTask} />
          </div>
        </div>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    </div>
  );
}

// ---------- Headline numbers ----------

function StatTiles({ data }: { data: DashboardData }) {
  const { totals, range } = data;
  const tiles: {
    label: string;
    value: number;
    icon: LucideIcon;
    tone?: string;
  }[] = [
    { label: "Open", value: totals.open, icon: InboxIcon },
    {
      label: "In progress",
      value: totals.inProgress,
      icon: CircleDotIcon,
    },
    {
      label: "Overdue",
      value: totals.overdue,
      icon: AlertTriangleIcon,
      tone: totals.overdue > 0 ? "text-red-600 dark:text-red-400" : undefined,
    },
    { label: "Unassigned", value: totals.unassigned, icon: UserRoundXIcon },
    {
      label: `Created · ${range.days}d`,
      value: totals.created,
      icon: InboxIcon,
    },
    {
      label: `Resolved · ${range.days}d`,
      value: totals.resolved,
      icon: statusCategoryMeta.done.icon,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className="space-y-1 rounded-xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icon className={cn("size-3.5", tone)} />
            {label}
          </p>
          <p className="text-2xl font-semibold">{value.toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ children }: { children: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
      {children}
    </div>
  );
}

// ---------- Created vs resolved ----------

const trendConfig = {
  created: { label: "Created", theme: ORANGE },
  resolved: { label: "Resolved", theme: BLUE },
} satisfies ChartConfig;

function CreatedVsResolvedCard({ data }: { data: DashboardData }) {
  const { totals, range } = data;
  const net = totals.created - totals.resolved;
  const series = data.createdVsResolved.map((day) => ({
    ...day,
    label: format(parseISO(day.date), "MMM d"),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Created vs resolved</CardTitle>
        <CardDescription>
          {totals.created === 0 && totals.resolved === 0
            ? `No activity in the last ${range.days} days`
            : net > 0
              ? `Backlog grew by ${net} over ${range.days} days`
              : net < 0
                ? `Backlog shrank by ${-net} over ${range.days} days`
                : `As much resolved as created over ${range.days} days`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={trendConfig}
          className="aspect-auto h-56 w-full"
          aria-label={`Issues created and resolved per day over the last ${range.days} days`}
        >
          <LineChart data={series} margin={{ top: 8, right: 12, left: -16 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={24} />
            <YAxis {...axisProps} allowDecimals={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              dataKey="created"
              type="linear"
              stroke="var(--color-created)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            />
            <Line
              dataKey="resolved"
              type="linear"
              stroke="var(--color-resolved)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ---------- Workload ----------

const workloadConfig = {
  inProgress: { label: "In progress", theme: BLUE },
  todo: { label: "To do", theme: ORANGE },
} satisfies ChartConfig;

const MAX_WORKLOAD_ROWS = 8;

function WorkloadCard({ data }: { data: DashboardData }) {
  const rows = data.workload.slice(0, MAX_WORKLOAD_ROWS).map((row) => ({
    name: row.user ? displayName(row.user) : "Unassigned",
    inProgress: row.inProgress,
    todo: row.todo,
    total: row.inProgress + row.todo,
    points: row.points,
  }));
  const hidden = data.workload.length - rows.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workload</CardTitle>
        <CardDescription>
          Open issues per person
          {hidden > 0 && ` · top ${rows.length} of ${data.workload.length}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyChart>No open work. Nice.</EmptyChart>
        ) : (
          <ChartContainer
            config={workloadConfig}
            // Height follows the number of people so bars keep their size
            style={{ height: Math.max(160, rows.length * 36 + 56) }}
            className="aspect-auto w-full"
            aria-label="Open issues per person, split into in progress and to do"
          >
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 0, right: 32, left: 0 }}
              barCategoryGap={8}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                {...axisProps}
                width={112}
                tickFormatter={(name: string) =>
                  name.length > 16 ? `${name.slice(0, 15)}…` : name
                }
              />
              <ChartTooltip
                cursor={{ fillOpacity: 0.4 }}
                content={<ChartTooltipContent />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              {/* A 2px surface-coloured stroke separates the stacked segments */}
              <Bar
                dataKey="inProgress"
                stackId="work"
                fill="var(--color-inProgress)"
                stroke="var(--card)"
                strokeWidth={2}
                maxBarSize={20}
              />
              <Bar
                dataKey="todo"
                stackId="work"
                fill="var(--color-todo)"
                stroke="var(--card)"
                strokeWidth={2}
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
              >
                <LabelList
                  dataKey="total"
                  position="right"
                  className="fill-muted-foreground"
                  fontSize={11}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Issues by status ----------

const statusConfig = {
  count: { label: "Issues", theme: BLUE },
} satisfies ChartConfig;

function StatusCard({ data }: { data: DashboardData }) {
  const rows = data.statuses.map((status) => ({
    name: status.name,
    count: status.count,
    category: status.category,
  }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Issues by status</CardTitle>
        <CardDescription>
          {total.toLocaleString()} {total === 1 ? "issue" : "issues"} in the
          workflow
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyChart>No issues yet</EmptyChart>
        ) : (
          <ChartContainer
            config={statusConfig}
            style={{ height: Math.max(160, rows.length * 36 + 16) }}
            className="aspect-auto w-full"
            aria-label="Number of issues in each workflow status"
          >
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 0, right: 32, left: 0 }}
              barCategoryGap={8}
            >
              <CartesianGrid horizontal={false} />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                {...axisProps}
                width={112}
              />
              <ChartTooltip
                cursor={{ fillOpacity: 0.4 }}
                content={<ChartTooltipContent hideIndicator />}
              />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
              >
                <LabelList
                  dataKey="count"
                  position="right"
                  className="fill-muted-foreground"
                  fontSize={11}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Epic progress ----------

function EpicProgressCard({
  data,
  onOpenTask,
}: {
  data: DashboardData;
  onOpenTask: (taskId: string) => void;
}) {
  const open = data.epics.filter((epic) => epic.statusCategory !== "done");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Epic progress</CardTitle>
        <CardDescription>
          {data.epics.length === 0
            ? "No epics yet"
            : `${open.length} open ${open.length === 1 ? "epic" : "epics"}`}
        </CardDescription>
        <CardAction>
          <ZapIcon className="size-4 text-violet-600 dark:text-violet-400" />
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.epics.length === 0 ? (
          <EmptyChart>Group related work with the Epic issue type</EmptyChart>
        ) : (
          <ul className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {data.epics.map((epic) => {
              const percent = epic.total
                ? Math.round((epic.done / epic.total) * 100)
                : 0;
              const epicDone = epic.statusCategory === "done";
              return (
                <li key={epic._id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <TaskKey
                      value={epic.key}
                      className={cn(epicDone && "line-through")}
                    />
                    <button
                      type="button"
                      onClick={() => onOpenTask(epic._id)}
                      className={cn(
                        "min-w-0 flex-1 truncate text-left font-medium hover:underline",
                        epicDone && "text-muted-foreground",
                      )}
                    >
                      {epic.title}
                    </button>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {epic.total === 0
                        ? "No issues"
                        : `${epic.done}/${epic.total} · ${percent}%`}
                    </span>
                  </div>
                  <Progress
                    value={percent}
                    className="h-1.5"
                    aria-label={`${epic.key} ${percent}% done`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
