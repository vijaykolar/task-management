import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

interface QueryErrorProps {
  title?: string;
  error: Error | null;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function QueryError({
  title = "Something went wrong",
  error,
  onRetry,
  isRetrying,
}: QueryErrorProps) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="bg-destructive/10 text-destructive"
        >
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>
          {error?.message || "We couldn't load this data."}
        </EmptyDescription>
      </EmptyHeader>
      {onRetry && (
        <EmptyContent>
          <Button variant="outline" onClick={onRetry} disabled={isRetrying}>
            <RefreshCwIcon
              className={isRetrying ? "animate-spin" : undefined}
            />
            Try again
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
