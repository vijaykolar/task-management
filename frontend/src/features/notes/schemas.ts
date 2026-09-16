import { z } from "zod";

import { isRichTextEmpty, richTextToPlainText } from "@/lib/rich-text";

// Mirrors noteValidator() in backend/src/validators/index.ts
export const MAX_NOTE_CHARS = 10_000;

export const noteSchema = z.object({
  /** Rich text HTML from the editor */
  content: z
    .string()
    .refine((html) => !isRichTextEmpty(html), "Write something first")
    .refine(
      (html) => richTextToPlainText(html).length <= MAX_NOTE_CHARS,
      "Keep notes under 10,000 characters",
    ),
});
export type NoteValues = z.infer<typeof noteSchema>;
