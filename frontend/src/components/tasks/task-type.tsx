import { ZapIcon } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEpics } from "@/features/tasks/hooks";
import { taskTypeMeta } from "@/lib/task-type";
import { cn } from "@/lib/utils";
import { AvailableTaskTypes, type TaskType } from "@/types/models";

export function TaskTypeIcon({
  type,
  className,
}: {
  type: TaskType;
  className?: string;
}) {
  const { icon: Icon, label, className: tone } = taskTypeMeta[type ?? "task"];
  return (
    <Icon
      className={cn("size-4 shrink-0", tone, className)}
      aria-label={label}
      role="img"
    />
  );
}

/** Ticket key in a quiet monospace style, e.g. SPST-12 */
export function TaskKey({
  value,
  className,
}: {
  value?: string;
  className?: string;
}) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-xs text-muted-foreground tabular-nums",
        className,
      )}
    >
      {value}
    </span>
  );
}

export function TaskTypeSelect({
  value,
  onValueChange,
  id,
  size,
  className,
  disabled,
  allowEpic = true,
}: {
  value: TaskType;
  onValueChange: (type: TaskType) => void;
  id?: string;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
  /** Tasks in a sprint can't become epics */
  allowEpic?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as TaskType)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        className={className}
        aria-label="Issue type"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {AvailableTaskTypes.filter(
          (type) => allowEpic || type !== "epic" || value === "epic",
        ).map((type) => (
          <SelectItem key={type} value={type}>
            <TaskTypeIcon type={type} />
            {taskTypeMeta[type].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Radix Select doesn't allow "" as an item value
const NO_EPIC = "__none__";

/** Picks the epic a task belongs to. `value` "" = none. */
export function EpicSelect({
  projectId,
  value,
  onValueChange,
  excludeId,
  id,
  size,
  className,
  disabled,
}: {
  projectId: string;
  value: string;
  onValueChange: (epicId: string) => void;
  /** Hide this task (an epic can't be its own parent) */
  excludeId?: string;
  id?: string;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
}) {
  const epics = useEpics(projectId);
  const options = (epics.data ?? []).filter((epic) => epic._id !== excludeId);

  return (
    <Select
      value={value || NO_EPIC}
      onValueChange={(v) => onValueChange(v === NO_EPIC ? "" : v)}
      disabled={disabled || epics.isPending}
    >
      <SelectTrigger
        id={id}
        size={size}
        className={className}
        aria-label="Epic"
      >
        <SelectValue placeholder="Loading epics…" />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={NO_EPIC}>
          <span className="text-muted-foreground">No epic</span>
        </SelectItem>
        {options.map((epic) => (
          <SelectItem key={epic._id} value={epic._id}>
            <ZapIcon className="text-violet-600 dark:text-violet-400" />
            <span className="font-mono text-xs text-muted-foreground">
              {epic.key}
            </span>
            <span className="max-w-56 truncate">{epic.title}</span>
          </SelectItem>
        ))}
        {epics.isSuccess && options.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No epics yet. Create a task with the Epic type.
          </p>
        )}
      </SelectContent>
    </Select>
  );
}

/** Small chip naming a task's epic */
export function EpicChip({
  epic,
  className,
}: {
  epic?: { key: string; title: string };
  className?: string;
}) {
  if (!epic) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-40 items-center gap-1 rounded-md bg-violet-500/10 px-1.5 text-xs text-violet-700 dark:text-violet-300",
        className,
      )}
      title={`Epic ${epic.key}: ${epic.title}`}
    >
      <ZapIcon className="size-3 shrink-0" />
      <span className="truncate">{epic.title}</span>
    </span>
  );
}
