import { ListFilterIcon } from "lucide-react";

import { PriorityIcon } from "@/components/tasks/task-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TaskListParams } from "@/features/tasks/api";
import { useProjectLabels } from "@/features/tasks/hooks";
import { taskPriorityMeta } from "@/lib/task-priority";
import { AvailableTaskPriorities, type TaskPriority } from "@/types/models";

export interface TaskFieldFilters {
  priority?: TaskPriority;
  label?: string;
  due?: TaskListParams["due"];
}

const ALL = "__all__";

const dueLabels: Record<NonNullable<TaskListParams["due"]>, string> = {
  overdue: "Overdue",
  week: "Due in the next 7 days",
  none: "No due date",
};

/** "Filters" popover for priority, label and due date */
export function TaskFilters({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value: TaskFieldFilters;
  onChange: (filters: TaskFieldFilters) => void;
}) {
  const labels = useProjectLabels(projectId);
  const activeCount = Object.values(value).filter(Boolean).length;

  const set = <K extends keyof TaskFieldFilters>(key: K, next: string) =>
    onChange({
      ...value,
      [key]: next === ALL ? undefined : (next as TaskFieldFilters[K]),
    });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="flex-1 sm:flex-none">
          <ListFilterIcon />
          Filters
          {activeCount > 0 && (
            <Badge className="h-4 min-w-4 px-1 tabular-nums">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="filter-priority">Priority</FieldLabel>
            <Select
              value={value.priority ?? ALL}
              onValueChange={(v) => set("priority", v)}
            >
              <SelectTrigger id="filter-priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any priority</SelectItem>
                {[...AvailableTaskPriorities].reverse().map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    <PriorityIcon priority={priority} />
                    {taskPriorityMeta[priority].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="filter-label">Label</FieldLabel>
            <Select
              value={value.label ?? ALL}
              onValueChange={(v) => set("label", v)}
            >
              <SelectTrigger id="filter-label" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any label</SelectItem>
                {labels.data?.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {labels.isSuccess && labels.data.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No labels used in this project yet.
              </p>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="filter-due">Due date</FieldLabel>
            <Select
              value={value.due ?? ALL}
              onValueChange={(v) => set("due", v)}
            >
              <SelectTrigger id="filter-due" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any due date</SelectItem>
                {Object.entries(dueLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({})}
              className="text-muted-foreground"
            >
              Clear filters
            </Button>
          )}
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}
