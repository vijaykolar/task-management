/**
 * Roadmap date maths. Everything is a `YYYY-MM-DD` key handled in UTC, so a
 * bar covers the same calendar days for everyone, wherever they are.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The calendar day of a stored date (they are kept at 12:00 UTC) */
export const dayOf = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10) : undefined;

export const todayKey = () => new Date().toISOString().slice(0, 10);

const msOf = (key: string) => Date.parse(`${key}T00:00:00.000Z`);

export const addDays = (key: string, days: number) =>
  new Date(msOf(key) + days * DAY_MS).toISOString().slice(0, 10);

/** Whole days from `from` to `to`; negative when `to` is earlier */
export const daysBetween = (from: string, to: string) =>
  Math.round((msOf(to) - msOf(from)) / DAY_MS);

export const firstOfMonth = (key: string) => `${key.slice(0, 7)}-01`;

export const startOfNextMonth = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return month === 12
    ? `${year! + 1}-01-01`
    : `${year}-${String(month! + 1).padStart(2, "0")}-01`;
};

export const isWeekend = (key: string) => {
  const day = new Date(msOf(key)).getUTCDay();
  return day === 0 || day === 6;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "Sep" on its own, "Jan 2027" when the year turns */
export const monthLabel = (key: string, showYear: boolean) => {
  const [year, month] = key.split("-").map(Number);
  const name = MONTHS[month! - 1];
  return showYear || month === 1 ? `${name} ${year}` : name!;
};

export const dayLabel = (key: string) => {
  const [, , day] = key.split("-");
  return String(Number(day));
};

/** The months a window covers, as bands to draw across the header */
export function monthsIn(from: string, to: string) {
  const months: { key: string; start: string; days: number }[] = [];
  let cursor = firstOfMonth(from);
  while (cursor <= to) {
    const next = startOfNextMonth(cursor);
    const start = cursor < from ? from : cursor;
    const end = next > to ? to : next;
    months.push({
      key: cursor,
      start,
      days: Math.max(daysBetween(start, end), 1),
    });
    cursor = next;
  }
  return months;
}

/** Runs of consecutive weekend days, for shading */
export function weekendsIn(from: string, to: string) {
  const runs: { start: string; days: number }[] = [];
  const total = daysBetween(from, to);
  for (let index = 0; index <= total; index += 1) {
    const key = addDays(from, index);
    if (!isWeekend(key)) continue;
    const last = runs.at(-1);
    if (last && addDays(last.start, last.days) === key) last.days += 1;
    else runs.push({ start: key, days: 1 });
  }
  return runs;
}
