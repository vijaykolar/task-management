// Due dates are calendar days. The API stores them at 12:00 UTC, so the first
// 10 characters of the ISO string are the day in every timezone.

/** `YYYY-MM-DD` for a local Date (e.g. from the date picker) */
export function toDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local Date at midnight for a `YYYY-MM-DD` key */
export function fromDateKey(key: string) {
  const [year, month, day] = key.slice(0, 10).split("-").map(Number);
  return new Date(year!, month! - 1, day);
}

export function dueDateKey(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10) : undefined;
}

export type DueState = "overdue" | "today" | "soon" | "later";

export function dueState(iso: string | null | undefined): DueState | null {
  const key = dueDateKey(iso);
  if (!key) return null;
  const today = toDateKey(new Date());
  if (key < today) return "overdue";
  if (key === today) return "today";
  const inThreeDays = new Date();
  inThreeDays.setDate(inThreeDays.getDate() + 3);
  return key <= toDateKey(inThreeDays) ? "soon" : "later";
}

export function formatDueDate(iso: string | null | undefined) {
  const key = dueDateKey(iso);
  if (!key) return "No due date";
  const date = fromDateKey(key);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}
