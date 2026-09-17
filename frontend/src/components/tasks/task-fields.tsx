import { CalendarIcon, TagIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { useProjectLabels } from "@/features/tasks/hooks";
import {
  dueState,
  formatDueDate,
  fromDateKey,
  toDateKey,
} from "@/lib/due-date";
import { formatPoints, MAX_STORY_POINTS } from "@/lib/story-points";
import { taskPriorityMeta } from "@/lib/task-priority";
import { cn } from "@/lib/utils";
import {
  AvailableTaskPriorities,
  MAX_LABEL_LENGTH,
  MAX_TASK_LABELS,
  type TaskPriority,
} from "@/types/models";

// ---------- Priority ----------

export function PriorityIcon({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  const { icon: Icon, label, className: tone } = taskPriorityMeta[priority];
  return (
    <Icon
      className={cn("size-4 shrink-0", tone, className)}
      aria-label={`${label} priority`}
    />
  );
}

export function PrioritySelect({
  value,
  onValueChange,
  id,
  size,
  className,
  disabled,
}: {
  value: TaskPriority;
  onValueChange: (priority: TaskPriority) => void;
  id?: string;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as TaskPriority)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        className={className}
        aria-label="Priority"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {[...AvailableTaskPriorities].reverse().map((priority) => (
          <SelectItem key={priority} value={priority}>
            <PriorityIcon priority={priority} />
            {taskPriorityMeta[priority].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------- Story points ----------

/** Compact estimate pill; renders nothing for unestimated tasks */
export function PointsBadge({
  points,
  className,
}: {
  points?: number | null;
  className?: string;
}) {
  if (points === undefined || points === null) return null;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-5 min-w-5 rounded-full px-1.5 font-normal tabular-nums",
        className,
      )}
      title={`Story points: ${points}`}
      aria-label={`${formatPoints(points)}`}
    >
      {points}
    </Badge>
  );
}

/** Numeric estimate input. `value` is the text typed, "" for none. */
export function StoryPointsInput({
  value,
  onChange,
  onCommit,
  id,
  className,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Called on blur or Enter, for inline editing */
  onCommit?: () => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      min={0}
      max={MAX_STORY_POINTS}
      step={0.5}
      placeholder="None"
      value={value}
      disabled={disabled}
      aria-invalid={invalid}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && onCommit) {
          event.preventDefault();
          onCommit();
        }
      }}
      className={cn("tabular-nums", className)}
    />
  );
}

// ---------- Due date ----------

const dueStateStyles = {
  overdue: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  today:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  soon: "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  later: "text-muted-foreground",
} as const;

export function DueDateBadge({
  dueDate,
  done,
  className,
}: {
  dueDate?: string;
  done?: boolean;
  className?: string;
}) {
  const state = dueState(dueDate);
  if (!state) return null;
  const tone = done ? "later" : state;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-normal", dueStateStyles[tone], className)}
      title={
        !done && state === "overdue"
          ? "Overdue"
          : !done && state === "today"
            ? "Due today"
            : "Due date"
      }
    >
      <CalendarIcon data-icon="inline-start" />
      {formatDueDate(dueDate)}
    </Badge>
  );
}

/** Button + calendar popover. `value` is `YYYY-MM-DD` or "" for none. */
export function DueDatePicker({
  value,
  onChange,
  id,
  className,
  size = "default",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  size?: "sm" | "default";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? fromDateKey(value) : undefined;
  const state = dueState(value || undefined);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            size={size}
            disabled={disabled}
            className={cn(
              "flex-1 justify-start font-normal",
              !value && "text-muted-foreground",
              state === "overdue" && "text-red-600 dark:text-red-400",
            )}
          >
            <CalendarIcon />
            {value ? formatDueDate(value) : "No due date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              onChange(date ? toDateKey(date) : "");
              setOpen(false);
            }}
          />
          <div className="flex gap-2 border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={() => {
                onChange(toDateKey(new Date()));
                setOpen(false);
              }}
            >
              Today
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex-1 text-muted-foreground"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---------- Labels ----------

function normalizeLabel(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, "-");
}

const LABEL_PATTERN = /^[\p{L}\p{N}_.-]+$/u;

export function LabelList({
  labels,
  max,
  className,
}: {
  labels: string[];
  max?: number;
  className?: string;
}) {
  if (!labels.length) return null;
  const shown = max ? labels.slice(0, max) : labels;
  const hidden = labels.length - shown.length;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((label) => (
        <Badge
          key={label}
          variant="secondary"
          className="h-5 max-w-40 truncate px-1.5 font-normal"
          title={label}
        >
          {label}
        </Badge>
      ))}
      {hidden > 0 && (
        <Badge variant="outline" className="h-5 px-1.5 font-normal">
          +{hidden}
        </Badge>
      )}
    </div>
  );
}

/** Jira-style label input: type and press Enter/comma, with autocomplete */
export function LabelsInput({
  projectId,
  value,
  onChange,
  id,
  disabled,
}: {
  projectId: string;
  value: string[];
  onChange: (labels: string[]) => void;
  id?: string;
  disabled?: boolean;
}) {
  const existing = useProjectLabels(projectId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const suggestions = useMemo(() => {
    const term = normalizeLabel(draft);
    return (existing.data ?? [])
      .filter((label) => !value.includes(label))
      .filter((label) => !term || label.includes(term))
      .slice(0, 6);
  }, [existing.data, draft, value]);

  const add = (raw: string) => {
    const label = normalizeLabel(raw);
    if (!label) return;
    if (value.includes(label)) {
      setDraft("");
      return;
    }
    if (value.length >= MAX_TASK_LABELS) {
      setError(`At most ${MAX_TASK_LABELS} labels`);
      return;
    }
    if (label.length > MAX_LABEL_LENGTH || !LABEL_PATTERN.test(label)) {
      setError("Use letters, numbers, dashes, dots or underscores");
      return;
    }
    onChange([...value, label]);
    setDraft("");
    setError(null);
    setHighlight(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
      if (!draft.trim() && event.key !== "Enter") return;
      event.preventDefault();
      add(
        focused && suggestions[highlight] && draft
          ? suggestions[highlight]!
          : draft,
      );
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (event.key === "Escape") {
      setFocused(false);
    }
  };

  return (
    <div className="relative space-y-1.5">
      <div
        className={cn(
          "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input px-2 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
          disabled && "pointer-events-none opacity-50",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
        {value.map((label) => (
          <Badge key={label} variant="secondary" className="h-5 gap-0.5 pr-0.5">
            {label}
            <button
              type="button"
              className="rounded-sm p-0.5 hover:bg-background/60"
              onClick={(event) => {
                event.stopPropagation();
                onChange(value.filter((l) => l !== label));
              }}
              aria-label={`Remove label ${label}`}
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
            setHighlight(0);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Let a click on a suggestion land first
            setTimeout(() => setFocused(false), 120);
            if (draft.trim()) add(draft);
          }}
          placeholder={value.length ? "" : "Add labels…"}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Add label"
          autoComplete="off"
        />
      </div>

      {focused && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
        >
          {suggestions.map((label, index) => (
            <li
              key={label}
              role="option"
              aria-selected={index === highlight}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
                index === highlight && "bg-accent",
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                add(label);
              }}
              onMouseEnter={() => setHighlight(index)}
            >
              <TagIcon className="size-3.5 text-muted-foreground" />
              {label}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
