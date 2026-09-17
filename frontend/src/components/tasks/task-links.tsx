import { CheckIcon, LinkIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { TaskStatusBadge } from "@/components/tasks/task-status-badge";
import { TaskKey, TaskTypeIcon } from "@/components/tasks/task-type";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  useAddTaskLink,
  useRemoveTaskLink,
  useTaskLinks,
  useTaskPicker,
} from "@/features/tasks/hooks";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import type { TaskLink, TaskLinkType, TaskRef } from "@/types/models";

/** How a relation reads from each side */
const RELATIONS = [
  { id: "blocks", type: "blocks", direction: "outward", label: "blocks" },
  {
    id: "blocked_by",
    type: "blocks",
    direction: "inward",
    label: "is blocked by",
  },
  {
    id: "relates_to",
    type: "relates_to",
    direction: "outward",
    label: "relates to",
  },
  {
    id: "duplicates",
    type: "duplicates",
    direction: "outward",
    label: "duplicates",
  },
  {
    id: "duplicated_by",
    type: "duplicates",
    direction: "inward",
    label: "is duplicated by",
  },
] as const satisfies readonly {
  id: string;
  type: TaskLinkType;
  direction: TaskLink["direction"];
  label: string;
}[];

type RelationId = (typeof RELATIONS)[number]["id"];

/** "relates to" has no direction, so both sides read the same */
function relationLabel(link: Pick<TaskLink, "type" | "direction">) {
  if (link.type === "relates_to") return "relates to";
  return (
    RELATIONS.find(
      (relation) =>
        relation.type === link.type && relation.direction === link.direction,
    )?.label ?? link.type
  );
}

export function TaskLinks({
  projectId,
  task,
  canManage,
  onOpenTask,
}: {
  projectId: string;
  task: TaskRef;
  canManage: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const links = useTaskLinks(projectId, task._id);
  const removeLink = useRemoveTaskLink(projectId);
  const [adding, setAdding] = useState(false);

  // Group by how the relation reads from this task, in a stable order
  const groups = new Map<string, TaskLink[]>();
  for (const link of links.data ?? []) {
    const label = relationLabel(link);
    groups.set(label, [...(groups.get(label) ?? []), link]);
  }
  const order = RELATIONS.map((relation) => relation.label as string);
  const sortedGroups = [...groups.entries()].sort(
    ([a], [b]) => order.indexOf(a) - order.indexOf(b),
  );

  return (
    <div className="space-y-3">
      {links.isPending && <Skeleton className="h-9 w-full" />}
      {links.isError && (
        <p className="text-sm text-destructive">{links.error.message}</p>
      )}
      {links.isSuccess && links.data.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">No linked tasks.</p>
      )}

      {sortedGroups.map(([label, items]) => (
        <div key={label} className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground first-letter:uppercase">
            {label}
          </p>
          <ul className="divide-y rounded-lg border">
            {items.map((link) => (
              <li
                key={link._id}
                className="group/link flex items-center gap-2 px-3 py-2 text-sm"
              >
                <TaskTypeIcon type={link.task.type} />
                <TaskKey
                  value={link.task.key}
                  className={cn(
                    link.task.statusCategory === "done" && "line-through",
                  )}
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={() => onOpenTask(link.task._id)}
                >
                  {link.task.title}
                </button>
                <TaskStatusBadge
                  status={link.task.status}
                  projectId={projectId}
                  className="hidden sm:inline-flex"
                />
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover/link:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
                    aria-label={`Remove link to ${link.task.key}`}
                    disabled={removeLink.isPending}
                    onClick={() => removeLink.mutate(link._id)}
                  >
                    <XIcon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {canManage &&
        (adding ? (
          <AddLinkForm
            projectId={projectId}
            task={task}
            existing={links.data ?? []}
            onDone={() => setAdding(false)}
          />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <PlusIcon />
            Link a task
          </Button>
        ))}
    </div>
  );
}

function AddLinkForm({
  projectId,
  task,
  existing,
  onDone,
}: {
  projectId: string;
  task: TaskRef;
  existing: TaskLink[];
  onDone: () => void;
}) {
  const addLink = useAddTaskLink(projectId, task._id);
  const [relationId, setRelationId] = useState<RelationId>("blocks");
  const [target, setTarget] = useState<TaskRef | null>(null);
  const relation = RELATIONS.find((item) => item.id === relationId)!;

  const submit = () => {
    if (!target) return;
    addLink.mutate(
      {
        type: relation.type,
        direction: relation.direction,
        target: target._id,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2 sm:flex-row sm:items-center">
      <Select
        value={relationId}
        onValueChange={(value) => setRelationId(value as RelationId)}
      >
        <SelectTrigger className="sm:w-40" aria-label="Relation">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {RELATIONS.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <TaskPicker
        projectId={projectId}
        value={target}
        onChange={setTarget}
        excludeIds={[task._id, ...existing.map((link) => link.task._id)]}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          onClick={submit}
          disabled={!target || addLink.isPending}
        >
          {addLink.isPending ? <Spinner /> : <LinkIcon />}
          Link
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Searchable task combobox; matches titles and ticket keys */
export function TaskPicker({
  projectId,
  value,
  onChange,
  excludeIds = [],
}: {
  projectId: string;
  value: TaskRef | null;
  onChange: (task: TaskRef) => void;
  excludeIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim());
  const results = useTaskPicker(projectId, debounced);
  const options = (results.data ?? []).filter(
    (item) => !excludeIds.includes(item._id),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="min-w-0 flex-1 justify-start font-normal"
        >
          {value ? (
            <>
              <TaskKey value={value.key} />
              <span className="truncate">{value.title}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Search tasks…</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        {/* Results come from the server, so turn off client filtering */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Title or key, e.g. SPST-12"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {results.isFetching ? "Searching…" : "No matching tasks"}
            </CommandEmpty>
            <CommandGroup>
              {options.map((item) => (
                <CommandItem
                  key={item._id}
                  value={item._id}
                  onSelect={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                >
                  <TaskTypeIcon type={item.type} />
                  <TaskKey value={item.key} />
                  <span className="truncate">{item.title}</span>
                  {value?._id === item._id && <CheckIcon className="ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
