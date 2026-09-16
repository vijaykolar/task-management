import { useMemo } from "react";

import { sanitizeRichText } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/** Renders stored rich text HTML (sanitized again on the client) */
export function RichTextContent({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const safeHtml = useMemo(() => sanitizeRichText(html), [html]);

  return (
    <div
      className={cn("rich-text text-sm wrap-break-word", className)}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
