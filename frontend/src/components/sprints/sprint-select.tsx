import { InboxIcon, ZapIcon } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSprints } from "@/features/sprints/hooks";

const BACKLOG = "__backlog__";

/** Picks the sprint a task belongs to. `value` "" = backlog. */
export function SprintSelect({
  projectId,
  value,
  onValueChange,
  id,
  size,
  className,
  disabled,
}: {
  projectId: string;
  value: string;
  onValueChange: (sprintId: string) => void;
  id?: string;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
}) {
  const sprints = useSprints(projectId);
  // Completed sprints can't receive tasks, but show the current one if set
  const options =
    sprints.data?.sprints.filter(
      (sprint) => sprint.status !== "completed" || sprint._id === value,
    ) ?? [];

  return (
    <Select
      value={value || BACKLOG}
      onValueChange={(v) => onValueChange(v === BACKLOG ? "" : v)}
      disabled={disabled || sprints.isPending}
    >
      <SelectTrigger
        id={id}
        size={size}
        className={className}
        aria-label="Sprint"
      >
        <SelectValue placeholder="Loading sprints…" />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={BACKLOG}>
          <InboxIcon />
          Backlog
        </SelectItem>
        {options.length > 0 && (
          <SelectGroup>
            <SelectLabel>Sprints</SelectLabel>
            {options.map((sprint) => (
              <SelectItem key={sprint._id} value={sprint._id}>
                <ZapIcon
                  className={
                    sprint.status === "active" ? "text-emerald-500" : undefined
                  }
                />
                {sprint.name}
                {sprint.status === "active" && (
                  <span className="text-xs text-muted-foreground">active</span>
                )}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

/** Board / list filter: all tasks, the active sprint, a sprint or the backlog */
export function SprintFilterSelect({
  projectId,
  value,
  onValueChange,
}: {
  projectId: string;
  /** "all" | "active" | "backlog" | sprint id */
  value: string;
  onValueChange: (value: string) => void;
}) {
  const sprints = useSprints(projectId);
  const list = sprints.data?.sprints ?? [];
  const hasActive = list.some((sprint) => sprint.status === "active");

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="flex-1 sm:w-44" aria-label="Filter by sprint">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All tasks</SelectItem>
        {hasActive && (
          <SelectItem value="active">
            <ZapIcon className="text-emerald-500" />
            Active sprint
          </SelectItem>
        )}
        <SelectItem value="backlog">
          <InboxIcon />
          Backlog
        </SelectItem>
        {list.length > 0 && (
          <SelectGroup>
            <SelectLabel>Sprints</SelectLabel>
            {list.map((sprint) => (
              <SelectItem key={sprint._id} value={sprint._id}>
                {sprint.name}
                {sprint.status !== "planned" && (
                  <span className="text-xs text-muted-foreground">
                    {sprint.status}
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
