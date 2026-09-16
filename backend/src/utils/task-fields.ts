import { ApiError } from "./api-error.js";
import { MAX_LABEL_LENGTH, MAX_TASK_LABELS } from "./constants.js";

const LABEL_PATTERN = /^[\p{L}\p{N}_.-]+$/u;

/**
 * Normalizes the `labels` body field. Accepts an array, a JSON array string
 * (multipart forms) or a comma-separated string. Labels are lowercase and use
 * dashes instead of spaces, like Jira. `undefined` means "not provided".
 */
export const parseLabels = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined;

  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      list = value.split(",");
    }
  }
  if (!Array.isArray(list)) {
    list = value === "" || value === null ? [] : [String(value)];
  }

  const labels = [
    ...new Set(
      (list as unknown[])
        .map((label) => String(label).trim().toLowerCase().replace(/\s+/g, "-"))
        .filter(Boolean),
    ),
  ];

  if (labels.length > MAX_TASK_LABELS) {
    throw new ApiError(
      422,
      `A task can have at most ${MAX_TASK_LABELS} labels`,
    );
  }
  const invalid = labels.find(
    (label) => label.length > MAX_LABEL_LENGTH || !LABEL_PATTERN.test(label),
  );
  if (invalid) {
    throw new ApiError(
      422,
      `Label "${invalid}" is invalid: use up to ${MAX_LABEL_LENGTH} letters, numbers, dashes, dots or underscores`,
    );
  }
  return labels;
};

/**
 * Parses the `dueDate` body field (`YYYY-MM-DD`). `undefined` = not provided,
 * `null` = clear the due date. Stored at 12:00 UTC so the calendar day is the
 * same in every timezone.
 */
export const parseDueDate = (value: unknown): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "" || value === "null") return null;

  const text = String(value);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10);
  const date = new Date(`${day}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(422, "Due date is invalid");
  }
  return date;
};

export const startOfTodayUtc = () => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
};

/** `YYYY-MM-DD` of a stored due date, for activity history */
export const dueDateKey = (date: Date | null | undefined) =>
  date ? date.toISOString().slice(0, 10) : null;
