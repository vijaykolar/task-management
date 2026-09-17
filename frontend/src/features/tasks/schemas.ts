import { z } from "zod";

import { formatBytes } from "@/lib/format";
import { richTextToPlainText } from "@/lib/rich-text";
import { parsePoints } from "@/lib/story-points";
import { AvailableTaskTypes, TaskPriorities } from "@/types/models";

// Mirrors backend/src/middlewares/multer.middleware.ts
export const MAX_FILES_PER_UPLOAD = 5;
export const MAX_ATTACHMENTS_PER_TASK = 10;
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
// Mirrors taskFieldValidators() in backend/src/validators/index.ts
export const MAX_DESCRIPTION_CHARS = 5000;
export const ACCEPTED_FILE_TYPES =
  "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,application/pdf,text/plain,text/csv,text/markdown,application/zip,application/json,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

export const taskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Keep the title under 200 characters"),
  /** Rich text HTML, "" = none */
  description: z
    .string()
    .refine(
      (html) => richTextToPlainText(html).length <= MAX_DESCRIPTION_CHARS,
      "Keep the description under 5,000 characters",
    ),
  /** A status key from the project's workflow */
  status: z.string().min(1, "Choose a status"),
  type: z.enum(AvailableTaskTypes),
  /** Epic id, "" = none */
  epic: z.string(),
  /** "" = unassigned */
  assignedTo: z.string(),
  priority: z.enum([
    TaskPriorities.LOW,
    TaskPriorities.MEDIUM,
    TaskPriorities.HIGH,
    TaskPriorities.URGENT,
  ]),
  /** `YYYY-MM-DD`, "" = no due date */
  dueDate: z.string(),
  /** `YYYY-MM-DD`, "" = no start date; the roadmap draws the two as a bar */
  startDate: z.string(),
  labels: z.array(z.string()).max(10, "At most 10 labels"),
  /** Typed estimate, "" = unestimated */
  storyPoints: z.string().refine((value) => parsePoints(value) !== undefined, {
    message: "Use a number from 0 to 1000 (one decimal at most)",
  }),
  /** Sprint id, "" = backlog */
  sprint: z.string(),
});
export type TaskValues = z.infer<typeof taskSchema>;

export const subtaskTitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(200, "Keep it under 200 characters");

/** Returns an error message for files the backend would reject, or null */
export function validateFiles(files: File[], existingCount = 0) {
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return `You can upload up to ${MAX_FILES_PER_UPLOAD} files at a time`;
  }
  if (existingCount + files.length > MAX_ATTACHMENTS_PER_TASK) {
    return `A task can have at most ${MAX_ATTACHMENTS_PER_TASK} attachments`;
  }
  const tooLarge = files.find((file) => file.size > MAX_ATTACHMENT_SIZE);
  if (tooLarge) {
    return `“${tooLarge.name}” is larger than ${formatBytes(MAX_ATTACHMENT_SIZE)}`;
  }
  return null;
}
