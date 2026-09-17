import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectWorkflow } from "@/features/projects/hooks";
import { describeStatus, statusCategoryMeta } from "@/lib/task-status";
import { cn } from "@/lib/utils";
import type { ProjectStatus, TaskStatus } from "@/types/models";

/**
 * A status pill. Names come from the project's workflow: pass `statuses` when
 * you already have them (e.g. cross-project lists), otherwise `projectId`.
 */
export function TaskStatusBadge({
  status,
  projectId,
  statuses,
  className,
}: {
  status: TaskStatus;
  projectId?: string;
  statuses?: ProjectStatus[];
  className?: string;
}) {
  const workflow = useProjectWorkflow(statuses ? undefined : projectId);
  const { name, category } = describeStatus(statuses ?? workflow.all, status);
  const { icon: Icon, className: tone } = statusCategoryMeta[category];
  return (
    <Badge variant="outline" className={cn(tone, className)}>
      <Icon data-icon="inline-start" />
      {name}
    </Badge>
  );
}

interface TaskStatusSelectProps {
  projectId: string;
  value: TaskStatus;
  onValueChange: (status: TaskStatus) => void;
  id?: string;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

/** Picks a status from the project's workflow, in board order */
export function TaskStatusSelect({
  projectId,
  value,
  onValueChange,
  size,
  className,
  disabled,
  ...props
}: TaskStatusSelectProps) {
  const workflow = useProjectWorkflow(projectId);
  const current = workflow.describe(value);

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled || workflow.isPending}
    >
      <SelectTrigger size={size} className={className} {...props}>
        <SelectValue placeholder={current.name} />
      </SelectTrigger>
      <SelectContent position="popper">
        {workflow.statuses.map((status) => {
          const { icon: Icon, iconClassName } =
            statusCategoryMeta[status.category];
          return (
            <SelectItem key={status.key} value={status.key}>
              <Icon className={iconClassName} />
              {status.name}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
