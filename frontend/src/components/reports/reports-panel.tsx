import {
  BadgeCheckIcon,
  ChartLineIcon,
  InfoIcon,
  PencilIcon,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { QueryError } from "@/components/common/query-error";
import { CorrectReportDialog } from "@/components/reports/correct-report-dialog";
import { Button } from "@/components/ui/button";
import {
  BurndownChart,
  BurnupChart,
  VelocityChart,
} from "@/components/reports/report-charts";
import {
  SprintReportTasks,
  SprintSummary,
} from "@/components/reports/sprint-report-details";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSprintReport, useVelocity } from "@/features/reports/hooks";
import { useProjectRole } from "@/features/projects/hooks";
import { useSprints } from "@/features/sprints/hooks";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { formatDueDate } from "@/lib/due-date";
import type { ReportUnit, Sprint } from "@/types/models";

const VELOCITY_RANGES = [5, 7, 10] as const;

const unitNoun = (unit: ReportUnit) =>
  unit === "points" ? "story points" : "tasks";

function sprintDates(sprint: Pick<Sprint, "startDate" | "endDate">) {
  if (!sprint.startDate && !sprint.endDate) return null;
  return `${formatDueDate(sprint.startDate)} – ${formatDueDate(sprint.endDate)}`;
}

function ChartSkeleton() {
  return <Skeleton className="h-64 w-full" />;
}

export function ReportsPanel({ projectId }: { projectId: string }) {
  const sprints = useSprints(projectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [velocityRange, setVelocityRange] = useState<number>(7);

  const active = sprints.data?.sprints.filter((s) => s.status === "active");
  // Most recently completed first
  const completed = (
    sprints.data?.sprints.filter((s) => s.status === "completed") ?? []
  ).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const started = [...(active ?? []), ...completed];

  const sprintParam = searchParams.get("sprint");
  const sprintId = started.some((s) => s._id === sprintParam)
    ? sprintParam!
    : started[0]?._id;

  const report = useSprintReport(projectId, sprintId);
  const velocity = useVelocity(projectId, velocityRange);
  const { role } = useProjectRole(projectId);
  const canCorrect = can(role, "task:manage");
  const [correcting, setCorrecting] = useState(false);

  const unitParam = searchParams.get("unit");
  // Default to points once the team estimates, otherwise count tasks
  const hasPoints =
    !!report.data &&
    report.data.summary.committed.points + report.data.summary.added.points > 0;
  const unit: ReportUnit =
    unitParam === "points" || unitParam === "count"
      ? unitParam
      : hasPoints
        ? "points"
        : "count";

  const setParam = (key: string, value: string) =>
    setSearchParams(
      (params) => {
        params.set(key, value);
        return params;
      },
      { replace: true },
    );

  if (sprints.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <ChartSkeleton />
      </div>
    );
  }

  if (sprints.isError) {
    return (
      <QueryError
        title="Couldn't load sprints"
        error={sprints.error}
        onRetry={() => sprints.refetch()}
        isRetrying={sprints.isRefetching}
      />
    );
  }

  if (started.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartLineIcon />
          </EmptyMedia>
          <EmptyTitle>No sprint reports yet</EmptyTitle>
          <EmptyDescription>
            Reports appear once a sprint starts. Plan and start one from the
            Backlog view in the Tasks tab.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const data = report.data;
  const selected = started.find((s) => s._id === sprintId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={sprintId}
          onValueChange={(value) => setParam("sprint", value)}
        >
          <SelectTrigger className="w-full sm:w-72" aria-label="Sprint">
            <SelectValue placeholder="Choose a sprint" />
          </SelectTrigger>
          <SelectContent position="popper">
            {!!active?.length && (
              <SelectGroup>
                <SelectLabel>Active</SelectLabel>
                {active.map((sprint) => (
                  <SelectItem key={sprint._id} value={sprint._id}>
                    {sprint.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {completed.length > 0 && (
              <SelectGroup>
                <SelectLabel>Completed</SelectLabel>
                {completed.map((sprint) => (
                  <SelectItem key={sprint._id} value={sprint._id}>
                    {sprint.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        {selected && sprintDates(selected) && (
          <span className="text-sm text-muted-foreground">
            {sprintDates(selected)}
          </span>
        )}

        <Tabs
          value={unit}
          onValueChange={(value) => setParam("unit", value)}
          className="sm:ml-auto"
        >
          <TabsList aria-label="Measure">
            <TabsTrigger value="points">Story points</TabsTrigger>
            <TabsTrigger value="count">Task count</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {selected?.goal && (
        <p className="text-sm">
          <span className="text-muted-foreground">Sprint goal: </span>
          {selected.goal}
        </p>
      )}

      {data?.correction?.source === "rebuilt" && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm sm:flex-row sm:items-center">
          <InfoIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="flex-1 text-muted-foreground">
            This sprint started before reports were tracked, so its numbers were
            rebuilt from task history. Tasks moved out when it was completed may
            be missing.
            {!canCorrect && " A project admin can review and confirm it."}
          </p>
          {canCorrect && (
            <Button size="sm" onClick={() => setCorrecting(true)}>
              <PencilIcon />
              Review and correct
            </Button>
          )}
        </div>
      )}
      {data?.correction?.source === "confirmed" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BadgeCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span>
            Reviewed and confirmed
            {data.correction.confirmedAt &&
              ` on ${formatDate(data.correction.confirmedAt)}`}
          </span>
          {canCorrect && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setCorrecting(true)}
            >
              <PencilIcon />
              Edit
            </Button>
          )}
        </div>
      )}
      {data?.correction && (
        <CorrectReportDialog
          // Start from the latest lists each time it opens
          key={`${data.sprint._id}-${data.correction.confirmedAt ?? "rebuilt"}`}
          projectId={projectId}
          report={data}
          open={correcting}
          onOpenChange={setCorrecting}
        />
      )}

      {report.isError ? (
        <QueryError
          title="Couldn't load the sprint report"
          error={report.error}
          onRetry={() => report.refetch()}
          isRetrying={report.isRefetching}
        />
      ) : !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <ChartSkeleton />
        </div>
      ) : (
        <div
          className="space-y-6 transition-opacity data-[stale=true]:opacity-60"
          data-stale={report.isPlaceholderData}
        >
          <SprintSummary report={data} unit={unit} />

          {unit === "points" && data.summary.unestimated > 0 && (
            <p className="text-sm text-muted-foreground">
              {data.summary.unestimated}{" "}
              {data.summary.unestimated === 1 ? "task has" : "tasks have"} no
              story points and count as 0.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Burndown</CardTitle>
                <CardDescription>
                  Remaining {unitNoun(unit)} at the end of each day
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BurndownChart report={data} unit={unit} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Burnup</CardTitle>
                <CardDescription>
                  Completed {unitNoun(unit)} against total scope
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BurnupChart report={data} unit={unit} />
              </CardContent>
            </Card>
          </div>

          <SprintReportTasks report={data} projectId={projectId} unit={unit} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Velocity</CardTitle>
          <CardDescription>
            Committed and completed {unitNoun(unit)} in recent sprints
          </CardDescription>
          <CardAction>
            <Select
              value={String(velocityRange)}
              onValueChange={(value) => setVelocityRange(Number(value))}
            >
              <SelectTrigger size="sm" aria-label="Number of sprints">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                {VELOCITY_RANGES.map((range) => (
                  <SelectItem key={range} value={String(range)}>
                    Last {range} sprints
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardAction>
        </CardHeader>
        <CardContent>
          {velocity.isError ? (
            <p className="text-sm text-destructive">{velocity.error.message}</p>
          ) : !velocity.data ? (
            <ChartSkeleton />
          ) : velocity.data.sprints.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Velocity appears after the first sprint is completed.
            </p>
          ) : (
            <div className="space-y-3">
              <VelocityChart velocity={velocity.data} unit={unit} />
              <p className="text-sm text-muted-foreground">
                Average completed:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {velocity.data.average[unit]} {unitNoun(unit)}
                </span>{" "}
                per sprint
                {velocity.data.sprints.some((s) => s.approximate) &&
                  " · some older sprints are unconfirmed estimates"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
