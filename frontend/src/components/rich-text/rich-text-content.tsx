import { useMemo } from "react";

import { sanitizeRichText } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

/** Renders stored rich text HTML (sanitized again on the client) */
export function RichTextContent({
  html,
  className,
  onDoubleClick,
}: {
  html: string;
  className?: string;
  onDoubleClick?: () => void;
}) {
  const safeHtml = useMemo(() => sanitizeRichText(html), [html]);

  return (
    <div
      className={cn("rich-text text-sm wrap-break-word", className)}
      onDoubleClick={onDoubleClick}
      // Images open full size in a new tab
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target instanceof HTMLImageElement && target.src) {
          window.open(target.src, "_blank", "noopener,noreferrer");
        }
      }}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
