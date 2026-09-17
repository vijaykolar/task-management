import { ChevronRightIcon } from "lucide-react";
import { Link } from "react-router";

import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/format";
import { formatPoints } from "@/lib/story-points";
import { cn } from "@/lib/utils";
import type {
  ReportTask,
  ReportUnit,
  SprintReport,
  Tally,
} from "@/types/models";

const formatTally = (tally: Tally, unit: ReportUnit) =>
  unit === "points"
    ? formatPoints(tally.points)
    : `${tally.count} ${tally.count === 1 ? "task" : "tasks"}`;

/** The other unit, shown as secondary text */
const otherUnit = (unit: ReportUnit): ReportUnit =>
  unit === "points" ? "count" : "points";

function StatTile({
  label,
  tally,
  unit,
  hint,
}: {
  label: string;
  tally: Tally;
  unit: ReportUnit;
  hint?: string;
}) {
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{tally[unit]}</p>
      <p className="text-xs text-muted-foreground">
        {hint ?? formatTally(tally, otherUnit(unit))}
      </p>
    </div>
  );
}

export function SprintSummary({
  report,
  unit,
}: {
  report: SprintReport;
  unit: ReportUnit;
}) {
  const { summary } = report;
  const finalScope = summary.completed[unit] + summary.carriedOver[unit];
  const percent = finalScope
    ? Math.round((summary.completed[unit] / finalScope) * 100)
    : 0;
  const isActive = report.sprint.status === "active";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Committed" tally={summary.committed} unit={unit} />
        <StatTile label="Completed" tally={summary.completed} unit={unit} />
        <StatTile label="Added mid-sprint" tally={summary.added} unit={unit} />
        <StatTile label="Removed" tally={summary.removed} unit={unit} />
        <StatTile
          label={isActive ? "Still open" : "Carried over"}
          tally={summary.carriedOver}
          unit={unit}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex max-w-md flex-1 items-center gap-3">
          <Progress value={percent} className="h-2" />
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {percent}% complete
          </span>
        </div>
        {unit === "points" && summary.estimateDelta !== 0 && (
          <p className="text-sm text-muted-foreground">
            Estimates on committed tasks changed by{" "}
            {summary.estimateDelta > 0 ? "+" : "−"}
            {formatPoints(Math.abs(summary.estimateDelta))}
          </p>
        )}
      </div>
    </div>
  );
}

function TaskRows({
  tasks,
  projectId,
  unit,
  detail,
}: {
  tasks: ReportTask[];
  projectId: string;
  unit: ReportUnit;
  detail?: (task: ReportTask) => string | undefined;
}) {
  return (
    <ul className="divide-y">
      {tasks.map((task) => (
        <li
          key={task._id}
          className="flex items-center gap-3 px-4 py-2.5 text-sm"
        >
          {task.deleted ? (
            <span
              className="min-w-0 flex-1 truncate text-muted-foreground line-through"
              title="This task was deleted"
            >
              {task.title}
            </span>
          ) : (
            <Link
              to={`/projects/${projectId}?tab=tasks&task=${task._id}`}
              className="min-w-0 flex-1 truncate font-medium hover:underline"
            >
              {task.title}
            </Link>
          )}
          {detail?.(task) && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {detail(task)}
            </span>
          )}
          <TaskStatusBadge
            status={task.status}
            className="hidden sm:inline-flex"
          />
          <span
            className={cn(
              "w-14 shrink-0 text-right tabular-nums",
              task.storyPoints === null && "text-muted-foreground",
            )}
            title={unit === "count" ? "Story points" : undefined}
          >
            {task.storyPoints ?? "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SprintReportTasks({
  report,
  projectId,
  unit,
}: {
  report: SprintReport;
  projectId: string;
  unit: ReportUnit;
}) {
  const isActive = report.sprint.status === "active";
  const sections: {
    key: keyof SprintReport["tasks"];
    title: string;
    empty: string;
    detail?: (task: ReportTask) => string | undefined;
  }[] = [
    {
      key: "completed",
      title: "Completed",
      empty: "No tasks completed yet.",
      detail: (task) =>
        task.doneAtStart ? "Done before the sprint" : undefined,
    },
    {
      key: "carriedOver",
      title: isActive ? "Not completed yet" : "Not completed",
      empty: "Every task was completed.",
    },
    {
      key: "added",
      title: "Added after the sprint started",
      empty: "No scope was added.",
      detail: (task) => task.addedAt && `Added ${formatDate(task.addedAt)}`,
    },
    {
      key: "removed",
      title: "Removed from the sprint",
      empty: "No tasks were removed.",
      detail: (task) =>
        task.removedAt &&
        `${task.deleted ? "Deleted" : "Removed"} ${formatDate(task.removedAt)}`,
    },
  ];

  return (
    <div className="space-y-3">
      {sections.map((section, index) => {
        const tasks = report.tasks[section.key];
        return (
          <details
            key={section.key}
            // Open the first two lists; scope changes stay one click away
            open={index < 2 && tasks.length > 0}
            className="group rounded-xl border bg-card"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
              {section.title}
              <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
                {tasks.length}
              </span>
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {tasks.length > 0 &&
                  formatPoints(
                    tasks.reduce(
                      (sum, task) => sum + (task.storyPoints ?? 0),
                      0,
                    ),
                  )}
              </span>
            </summary>
            <div className="border-t">
              {tasks.length > 0 ? (
                <TaskRows
                  tasks={tasks}
                  projectId={projectId}
                  unit={unit}
                  detail={section.detail}
                />
              ) : (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  {section.empty}
                </p>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
