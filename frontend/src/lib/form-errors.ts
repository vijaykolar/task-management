import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { ApiClientError } from "@/lib/axios";

/**
 * Maps express-validator errors (`[{ email: "Email is invalid" }]`, status 422)
 * onto react-hook-form fields. Returns true when at least one field was set.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
) {
  if (!(error instanceof ApiClientError) || error.statusCode !== 422) {
    return false;
  }

  let applied = false;
  for (const item of error.errors) {
    if (!item || typeof item !== "object") continue;
    for (const [field, message] of Object.entries(item)) {
      if (fields.includes(field as Path<T>) && typeof message === "string") {
        setError(field as Path<T>, { type: "server", message });
        applied = true;
      }
    }
  }
  return applied;
}
