import { format, parseISO } from "date-fns";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { toDateKey } from "@/lib/due-date";
import type { ReportUnit, SprintReport, VelocityReport } from "@/types/models";

// Categorical slots 1 and 2, validated for colour-vision deficiency in both
// themes. Completed work is always blue, total scope / commitment orange.
const WORK_DONE = { light: "#2a78d6", dark: "#3987e5" };
const SCOPE = { light: "#eb6834", dark: "#d95926" };
const GUIDE = "var(--muted-foreground)";

const unitLabel = (unit: ReportUnit) =>
  unit === "points" ? "Story points" : "Tasks";

const dayLabel = (date: string) =>
  date === "start" ? "Start" : format(parseISO(date), "MMM d");

const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const;

/** Today's column label, when the sprint is still running */
function todayLabel(report: SprintReport) {
  if (report.sprint.status !== "active") return undefined;
  const today = toDateKey(new Date());
  return report.series.some((point) => point.date === today)
    ? dayLabel(today)
    : undefined;
}

// ---------- Burndown ----------

const burndownConfig = {
  remaining: { label: "Remaining", theme: WORK_DONE },
  ideal: { label: "Guideline", color: GUIDE },
} satisfies ChartConfig;

export function BurndownChart({
  report,
  unit,
}: {
  report: SprintReport;
  unit: ReportUnit;
}) {
  const { series, sprint } = report;
  const start = series[0]?.remaining?.[unit] ?? 0;
  // The guideline reaches zero on the planned end date
  const endKey = sprint.endDate?.slice(0, 10);
  const endIndex = Math.max(
    1,
    endKey
      ? series.findIndex((point) => point.date === endKey)
      : series.length - 1,
  );

  const data = series.map((point, index) => ({
    label: dayLabel(point.date),
    remaining: point.remaining?.[unit] ?? null,
    ideal:
      index <= endIndex
        ? Math.round(start * (1 - index / endIndex) * 10) / 10
        : null,
  }));
  const today = todayLabel(report);

  return (
    <ChartContainer
      config={burndownConfig}
      className="aspect-auto h-64 w-full"
      aria-label={`Burndown chart: ${unitLabel(unit).toLowerCase()} remaining per day`}
    >
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: -12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis {...axisProps} allowDecimals={false} width={48} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
        {today && (
          <ReferenceLine
            x={today}
            stroke={GUIDE}
            strokeOpacity={0.5}
            label={{
              value: "Today",
              position: "insideTopRight",
              fill: GUIDE,
              fontSize: 11,
            }}
          />
        )}
        <Line
          dataKey="ideal"
          type="linear"
          stroke="var(--color-ideal)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          activeDot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          dataKey="remaining"
          type="stepAfter"
          stroke="var(--color-remaining)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
          connectNulls={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

// ---------- Burnup ----------

const burnupConfig = {
  done: { label: "Completed", theme: WORK_DONE },
  scope: { label: "Total scope", theme: SCOPE },
} satisfies ChartConfig;

export function BurnupChart({
  report,
  unit,
}: {
  report: SprintReport;
  unit: ReportUnit;
}) {
  const data = report.series.map((point) => ({
    label: dayLabel(point.date),
    done: point.done?.[unit] ?? null,
    scope: point.scope?.[unit] ?? null,
  }));
  const today = todayLabel(report);

  return (
    <ChartContainer
      config={burnupConfig}
      className="aspect-auto h-64 w-full"
      aria-label={`Burnup chart: completed ${unitLabel(unit).toLowerCase()} against total scope per day`}
    >
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: -12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis {...axisProps} allowDecimals={false} width={48} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
        {today && (
          <ReferenceLine x={today} stroke={GUIDE} strokeOpacity={0.5} />
        )}
        <Area
          dataKey="done"
          type="stepAfter"
          stroke="var(--color-done)"
          strokeWidth={2}
          fill="var(--color-done)"
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
        />
        <Line
          dataKey="scope"
          type="stepAfter"
          stroke="var(--color-scope)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

// ---------- Velocity ----------

const velocityConfig = {
  committed: { label: "Committed", theme: SCOPE },
  completed: { label: "Completed", theme: WORK_DONE },
} satisfies ChartConfig;

export function VelocityChart({
  velocity,
  unit,
}: {
  velocity: VelocityReport;
  unit: ReportUnit;
}) {
  // Keyed by id: sprint names don't have to be unique
  const names = new Map(velocity.sprints.map((s) => [s._id, s.name]));
  const data = velocity.sprints.map((sprint) => ({
    id: sprint._id,
    committed: sprint.committed[unit],
    completed: sprint.completed[unit],
  }));
  const average = velocity.average[unit];
  const sprintName = (id: unknown) => names.get(String(id)) ?? "";

  return (
    <ChartContainer
      config={velocityConfig}
      className="aspect-auto h-64 w-full"
      aria-label={`Velocity chart: committed and completed ${unitLabel(unit).toLowerCase()} per sprint`}
    >
      <BarChart
        data={data}
        margin={{ top: 16, right: 12, left: -12 }}
        barGap={2}
        barCategoryGap="30%"
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="id"
          {...axisProps}
          interval="preserveStartEnd"
          tickFormatter={sprintName}
        />
        <YAxis {...axisProps} allowDecimals={false} width={48} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.5 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) =>
                sprintName(payload?.[0]?.payload?.id)
              }
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="committed"
          fill="var(--color-committed)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
        />
        <Bar
          dataKey="completed"
          fill="var(--color-completed)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
        />
        {average > 0 && (
          <ReferenceLine
            y={average}
            stroke={GUIDE}
            strokeDasharray="4 4"
            label={{
              value: `Avg ${average}`,
              position: "insideTopRight",
              fill: GUIDE,
              fontSize: 11,
            }}
          />
        )}
      </BarChart>
    </ChartContainer>
  );
}
