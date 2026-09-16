import { useHealthCheck } from "@/features/health/hooks";
import { cn } from "@/lib/utils";

/** Live API status from GET /healthcheck, polled every 30s */
export function HealthIndicator() {
  const { isSuccess, isError, isPending } = useHealthCheck();

  const label = isPending
    ? "Checking API…"
    : isSuccess
      ? "API online"
      : "API unreachable";

  return (
    <div
      className="flex items-center gap-2 px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
      title={label}
    >
      <span className="relative flex size-2">
        {isSuccess && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full bg-muted-foreground",
            isSuccess && "bg-emerald-500",
            isError && "bg-destructive",
          )}
        />
      </span>
      <span className="group-data-[collapsible=icon]:hidden">{label}</span>
    </div>
  );
}
