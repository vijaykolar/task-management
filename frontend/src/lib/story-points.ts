// Mirrors backend/src/utils/task-fields.ts
export const MAX_STORY_POINTS = 1000;

export const formatPoints = (points: number) =>
  `${Number.isInteger(points) ? points : points.toFixed(1)} ${points === 1 ? "pt" : "pts"}`;

/** Parses typed story points: a number, null when empty, undefined if invalid */
export function parsePoints(text: string): number | null | undefined {
  if (!text.trim()) return null;
  const points = Number(text);
  if (
    !Number.isFinite(points) ||
    points < 0 ||
    points > MAX_STORY_POINTS ||
    Math.abs(Math.round(points * 10) - points * 10) > 1e-6
  ) {
    return undefined;
  }
  return Math.round(points * 10) / 10;
}
