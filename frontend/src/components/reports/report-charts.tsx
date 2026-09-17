import { format, parseISO } from "date-fns";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
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

/** Saturday or Sunday, for a `YYYY-MM-DD` calendar day */
const isWeekend = (date: string) => {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
};

/** Consecutive weekend days as [first, last] positions, for shading */
function weekendRuns(dates: string[]) {
  const runs: [number, number][] = [];
  dates.forEach((date, index) => {
    if (date === "start" || !isWeekend(date)) return;
    const last = runs.at(-1);
    if (last && last[1] === index - 1) last[1] = index;
    else runs.push([index, index]);
  });
  return runs;
}

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

  // Work is only expected on weekdays: the guideline stays flat on weekends
  const workingDaysUpTo: number[] = [];
  series.forEach((point, index) => {
    const before = workingDaysUpTo[index - 1] ?? 0;
    workingDaysUpTo.push(
      index === 0 || isWeekend(point.date) ? before : before + 1,
    );
  });
  const totalWorkingDays = workingDaysUpTo[endIndex] ?? 0;
  const progress = (index: number) =>
    totalWorkingDays > 0
      ? workingDaysUpTo[index]! / totalWorkingDays
      : // A sprint made only of weekend days: fall back to calendar days
        index / endIndex;

  const data = series.map((point, index) => ({
    index,
    label: dayLabel(point.date),
    remaining: point.remaining?.[unit] ?? null,
    ideal:
      index <= endIndex
        ? Math.round(start * (1 - progress(index)) * 10) / 10
        : null,
  }));
  const today = todayLabel(report);
  const todayIndex = data.find((point) => point.label === today)?.index;
  const weekends = weekendRuns(series.map((point) => point.date));

  return (
    <div className="space-y-2">
      <ChartContainer
        config={burndownConfig}
        className="aspect-auto h-64 w-full"
        aria-label={`Burndown chart: ${unitLabel(unit).toLowerCase()} remaining per day, weekends shaded`}
      >
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -12 }}>
          <CartesianGrid vertical={false} />
          {/* Non-working days, drawn first so everything sits on top */}
          {weekends.map(([first, last]) => (
            <ReferenceArea
              key={first}
              x1={first - 0.5}
              x2={last + 0.5}
              ifOverflow="hidden"
              fill="var(--muted-foreground)"
              fillOpacity={0.08}
              strokeOpacity={0}
            />
          ))}
          <XAxis
            dataKey="index"
            type="number"
            domain={[0, data.length - 1]}
            ticks={data.map((point) => point.index)}
            tickFormatter={(index: number) => data[index]?.label ?? ""}
            {...axisProps}
            minTickGap={16}
          />
          <YAxis {...axisProps} allowDecimals={false} width={48} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as
                    (typeof data)[number] | undefined;
                  if (!point) return "";
                  const date = series[point.index]?.date;
                  return date && date !== "start" && isWeekend(date)
                    ? `${point.label} · weekend`
                    : point.label;
                }}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {todayIndex !== undefined && (
            <ReferenceLine
              x={todayIndex}
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
      {weekends.length > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block size-2.5 rounded-sm bg-muted-foreground/15" />
          Weekends: no work expected, so the guideline stays flat
        </p>
      )}
    </div>
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
