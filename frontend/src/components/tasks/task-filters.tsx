import {
  BookmarkIcon,
  BookmarkPlusIcon,
  CheckIcon,
  ListFilterIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { PriorityIcon } from "@/components/tasks/task-fields";
import { EpicSelect, TaskTypeIcon } from "@/components/tasks/task-type";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { Spinner } from "@/components/ui/spinner";
import type { TaskListParams } from "@/features/tasks/api";
import {
  useDeleteSavedFilter,
  useProjectLabels,
  useSavedFilters,
  useSaveFilter,
} from "@/features/tasks/hooks";
import { taskPriorityMeta } from "@/lib/task-priority";
import { taskTypeMeta } from "@/lib/task-type";
import {
  AvailableTaskPriorities,
  AvailableTaskTypes,
  type SavedFilter,
  type TaskPriority,
  type TaskType,
} from "@/types/models";

/** Filters in the "Filters" popover */
export interface TaskFieldFilters {
  assignee?: "me" | "unassigned";
  type?: TaskType;
  epic?: string;
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

/** "Filters" popover for assignee, type, epic, priority, label and due date */
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
      [key]: next === ALL || next === "" ? undefined : next,
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
      <PopoverContent align="end" className="w-80">
        <FieldGroup className="gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="filter-assignee">Assignee</FieldLabel>
              <Select
                value={value.assignee ?? ALL}
                onValueChange={(v) => set("assignee", v)}
              >
                <SelectTrigger id="filter-assignee" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Anyone</SelectItem>
                  <SelectItem value="me">Me</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="filter-type">Type</FieldLabel>
              <Select
                value={value.type ?? ALL}
                onValueChange={(v) => set("type", v)}
              >
                <SelectTrigger id="filter-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any type</SelectItem>
                  {AvailableTaskTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      <TaskTypeIcon type={type} />
                      {taskTypeMeta[type].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="filter-epic">Epic</FieldLabel>
            <EpicSelect
              id="filter-epic"
              projectId={projectId}
              value={value.epic ?? ""}
              onValueChange={(v) => set("epic", v)}
              className="w-full"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
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
            </Field>
          </div>

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

/**
 * Personal saved filters: apply one, or save the current filters under a
 * name (saving an existing name replaces it).
 */
export function SavedFiltersMenu({
  projectId,
  current,
  onApply,
}: {
  projectId: string;
  /** The filters in effect now, as query-string values */
  current: Record<string, string>;
  onApply: (filter: SavedFilter) => void;
}) {
  const saved = useSavedFilters(projectId);
  const deleteFilter = useDeleteSavedFilter(projectId);
  const [saveOpen, setSaveOpen] = useState(false);

  const currentKey = JSON.stringify(sortedEntries(current));
  const hasFilters = Object.keys(current).length > 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex-1 sm:flex-none">
            <BookmarkIcon />
            Saved
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Your saved filters
          </DropdownMenuLabel>
          {saved.isPending && (
            <div className="flex justify-center py-2">
              <Spinner className="size-4" />
            </div>
          )}
          {saved.isSuccess && saved.data.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              None yet. Set some filters, then save them here.
            </p>
          )}
          {saved.data?.map((filter) => {
            const active =
              JSON.stringify(sortedEntries(filter.filters)) === currentKey;
            return (
              <DropdownMenuItem
                key={filter._id}
                onSelect={() => onApply(filter)}
                className="group/filter"
              >
                <CheckIcon className={active ? "" : "invisible"} />
                <span className="flex-1 truncate">{filter.name}</span>
                <button
                  type="button"
                  className="rounded-sm p-0.5 text-muted-foreground opacity-0 group-hover/filter:opacity-100 group-focus/filter:opacity-100 hover:text-destructive max-md:opacity-100"
                  aria-label={`Delete saved filter ${filter.name}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    deleteFilter.mutate(filter._id);
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!hasFilters}
            onSelect={() => setSaveOpen(true)}
          >
            <BookmarkPlusIcon />
            Save current filters…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          {saveOpen && (
            <SaveFilterForm
              projectId={projectId}
              filters={current}
              existingNames={saved.data?.map((filter) => filter.name) ?? []}
              onDone={() => setSaveOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function sortedEntries(filters: Record<string, string>) {
  return Object.entries(filters).sort(([a], [b]) => a.localeCompare(b));
}

function SaveFilterForm({
  projectId,
  filters,
  existingNames,
  onDone,
}: {
  projectId: string;
  filters: Record<string, string>;
  existingNames: string[];
  onDone: () => void;
}) {
  const saveFilter = useSaveFilter(projectId);
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const replaces = existingNames.includes(trimmed);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed) return;
    saveFilter.mutate({ name: trimmed, filters }, { onSuccess: onDone });
  };

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Save filters</DialogTitle>
        <DialogDescription>
          Saved filters are personal. Only you see them in this project.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="py-5">
        <Field data-invalid={!!saveFilter.error}>
          <FieldLabel htmlFor="saved-filter-name">Name</FieldLabel>
          <Input
            id="saved-filter-name"
            value={name}
            maxLength={40}
            placeholder="e.g. My open bugs"
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          {replaces && (
            <p className="text-xs text-muted-foreground">
              This replaces your existing filter with the same name.
            </p>
          )}
          <FieldError
            errors={
              saveFilter.error ? [{ message: saveFilter.error.message }] : []
            }
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!trimmed || saveFilter.isPending}>
          {saveFilter.isPending && <Spinner />}
          {replaces ? "Replace" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
