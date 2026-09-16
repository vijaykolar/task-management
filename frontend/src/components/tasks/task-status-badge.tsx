import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { taskStatusMeta } from "@/lib/task-status";
import { cn } from "@/lib/utils";
import { AvailableTaskStatuses, type TaskStatus } from "@/types/models";

export function TaskStatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  const { label, icon: Icon, className: tone } = taskStatusMeta[status];
  return (
    <Badge variant="outline" className={cn(tone, className)}>
      <Icon data-icon="inline-start" />
      {label}
    </Badge>
  );
}

interface TaskStatusSelectProps {
  value: TaskStatus;
  onValueChange: (status: TaskStatus) => void;
  id?: string;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function TaskStatusSelect({
  value,
  onValueChange,
  size,
  className,
  disabled,
  ...props
}: TaskStatusSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as TaskStatus)}
      disabled={disabled}
    >
      <SelectTrigger size={size} className={className} {...props}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {AvailableTaskStatuses.map((status) => {
          const { label, icon: Icon } = taskStatusMeta[status];
          return (
            <SelectItem key={status} value={status}>
              <Icon />
              {label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
