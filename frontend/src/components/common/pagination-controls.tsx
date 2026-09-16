import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { PaginationMeta } from "@/types/models";

interface PaginationControlsProps {
  pagination: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
  /** Shown while the next page loads behind the current one */
  isFetching?: boolean;
  itemLabel?: string;
  className?: string;
}

export function PaginationControls({
  pagination,
  onPageChange,
  isFetching,
  itemLabel = "items",
  className,
}: PaginationControlsProps) {
  if (!pagination || pagination.total === 0) return null;

  const { page, limit, total, totalPages } = pagination;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row",
        className,
      )}
    >
      <p className="flex items-center gap-2 tabular-nums">
        {isFetching && <Spinner className="size-3.5" />}
        Showing {from}–{to} of {total} {itemLabel}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeftIcon />
            Previous
          </Button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Next
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </div>
  );
}
