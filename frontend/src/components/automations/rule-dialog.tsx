import { PlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSaveRule, type RuleInput } from "@/features/automations/hooks";
import { browserTimeZone } from "@/features/auth/hooks";
import {
  useMemberOptions,
  useProjectWorkflow,
} from "@/features/projects/hooks";
import { useSprints } from "@/features/sprints/hooks";
import type {
  AutomationAction,
  AutomationActionType,
  AutomationCondition,
  AutomationConditionField,
  AutomationEvent,
  AutomationField,
  AutomationOperator,
  AutomationRule,
} from "@/types/models";

const EVENTS: { value: AutomationEvent; label: string }[] = [
  { value: "task_changed", label: "A task changes" },
  { value: "task_created", label: "A task is created" },
  { value: "sprint_started", label: "A sprint starts" },
  { value: "sprint_completed", label: "A sprint is completed" },
  { value: "schedule", label: "On a schedule" },
];

const WATCHABLE: { value: AutomationField; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "priority", label: "Priority" },
  { value: "sprint", label: "Sprint" },
  { value: "dueDate", label: "Due date" },
  { value: "labels", label: "Labels" },
  { value: "type", label: "Type" },
];

const CONDITION_FIELDS: { value: AutomationConditionField; label: string }[] = [
  { value: "type", label: "Type" },
  { value: "status", label: "Status" },
  { value: "statusCategory", label: "Status category" },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
  { value: "labels", label: "Labels" },
  { value: "sprint", label: "Sprint" },
  { value: "storyPoints", label: "Story points" },
  { value: "epic", label: "Epic" },
  { value: "dueDate", label: "Due date" },
];

const OPERATORS: { value: AutomationOperator; label: string }[] = [
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "doesn't contain" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is set" },
  { value: "gt", label: "is more than" },
  { value: "lt", label: "is less than" },
];

const ACTIONS: { value: AutomationActionType; label: string }[] = [
  { value: "set_status", label: "Set the status" },
  { value: "set_assignee", label: "Set the assignee" },
  { value: "set_priority", label: "Set the priority" },
  { value: "set_sprint", label: "Move to a sprint" },
  { value: "set_due_date", label: "Set the due date" },
  { value: "add_labels", label: "Add labels" },
  { value: "remove_labels", label: "Remove labels" },
  { value: "add_comment", label: "Post a comment" },
  { value: "notify", label: "Notify people" },
  { value: "create_task", label: "Create a task" },
];

const PRIORITIES = ["low", "medium", "high", "urgent"];
const TYPES = ["task", "story", "bug", "epic"];
const CATEGORIES = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const VALUELESS: AutomationOperator[] = ["is_empty", "is_not_empty"];

const emptyRule = (): RuleInput => ({
  name: "",
  enabled: true,
  trigger: { event: "task_changed", field: "status" },
  conditions: [],
  actions: [{ type: "set_assignee", value: "unassigned" }],
});

interface RuleDialogProps {
  projectId: string;
  rule?: AutomationRule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RuleDialog({
  projectId,
  rule,
  open,
  onOpenChange,
}: RuleDialogProps) {
  const [draft, setDraft] = useState<RuleInput>(emptyRule);
  const save = useSaveRule(projectId, rule?._id);
  const { statuses } = useProjectWorkflow(projectId);
  const { data: members } = useMemberOptions(projectId);
  const { data: sprintData } = useSprints(projectId);

  const sprints = useMemo(
    () => sprintData?.sprints.filter((s) => s.status !== "completed") ?? [],
    [sprintData],
  );
  const people = useMemo(
    () => members?.items.map((m) => m.user) ?? [],
    [members],
  );

  // Start from the rule being edited each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setDraft(
      rule
        ? {
            name: rule.name,
            enabled: rule.enabled,
            trigger: { ...rule.trigger },
            conditions: rule.conditions.map((c) => ({ ...c })),
            actions: rule.actions.map((a) => ({ ...a })),
          }
        : emptyRule(),
    );
  }, [open, rule]);

  const patch = (changes: Partial<RuleInput>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const setTrigger = (changes: Partial<RuleInput["trigger"]>) =>
    patch({ trigger: { ...draft.trigger, ...changes } });

  const setCondition = (index: number, changes: Partial<AutomationCondition>) =>
    patch({
      conditions: draft.conditions.map((condition, i) =>
        i === index ? { ...condition, ...changes } : condition,
      ),
    });

  const setAction = (index: number, changes: Partial<AutomationAction>) =>
    patch({
      actions: draft.actions.map((action, i) =>
        i === index ? { ...action, ...changes } : action,
      ),
    });

  /** The value input for a trigger, condition or action, per field */
  const valueInput = (
    field: string,
    value: string | undefined,
    onChange: (next: string) => void,
    options?: { allowActor?: boolean; allowSprintAliases?: boolean },
  ) => {
    const choices: { value: string; label: string }[] | null =
      field === "status"
        ? statuses.map((s) => ({ value: s.key, label: s.name }))
        : field === "statusCategory"
          ? CATEGORIES
          : field === "priority"
            ? PRIORITIES.map((p) => ({ value: p, label: p }))
            : field === "type"
              ? TYPES.map((t) => ({ value: t, label: t }))
              : field === "assignee"
                ? [
                    { value: "unassigned", label: "Nobody" },
                    ...(options?.allowActor
                      ? [{ value: "actor", label: "Whoever changed it" }]
                      : []),
                    ...people.map((p) => ({
                      value: p._id,
                      label: p.fullName || p.username,
                    })),
                  ]
                : field === "sprint"
                  ? [
                      { value: "backlog", label: "The backlog" },
                      ...(options?.allowSprintAliases
                        ? [
                            { value: "active", label: "The active sprint" },
                            { value: "next", label: "The next sprint" },
                          ]
                        : []),
                      ...sprints.map((s) => ({ value: s._id, label: s.name })),
                    ]
                  : null;

    if (!choices) {
      return (
        <Input
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field === "storyPoints" ? "5" : "Value"}
          className="h-9"
        />
      );
    }
    return (
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full">
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const isSchedule = draft.trigger.event === "schedule";
  const isChange = draft.trigger.event === "task_changed";

  const submit = () => {
    save.mutate(
      {
        ...draft,
        // A schedule always carries the zone its hour is read in
        trigger: isSchedule
          ? {
              ...draft.trigger,
              timeZone: draft.trigger.timeZone || browserTimeZone(),
              hour: draft.trigger.hour ?? 9,
              frequency: draft.trigger.frequency ?? "daily",
            }
          : draft.trigger,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "New rule"}</DialogTitle>
          <DialogDescription>
            Rules run on the server, for everyone. Automation never sends email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={draft.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Tidy up finished work"
            />
          </div>

          {/* ---------- Trigger ---------- */}
          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="text-sm font-medium">When</h3>
            <Select
              value={draft.trigger.event}
              onValueChange={(event) =>
                setTrigger({
                  event: event as AutomationEvent,
                  field: event === "task_changed" ? "status" : undefined,
                  to: undefined,
                  from: undefined,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENTS.map((event) => (
                  <SelectItem key={event.value} value={event.value}>
                    {event.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isChange && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  value={draft.trigger.field ?? ""}
                  onValueChange={(field) =>
                    setTrigger({
                      field: field as AutomationField,
                      to: undefined,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Which field" />
                  </SelectTrigger>
                  <SelectContent>
                    {WATCHABLE.map((field) => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {draft.trigger.field &&
                  !["labels", "dueDate"].includes(draft.trigger.field) && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        becomes
                      </span>
                      {valueInput(draft.trigger.field, draft.trigger.to, (to) =>
                        setTrigger({ to }),
                      )}
                    </div>
                  )}
              </div>
            )}

            {isSchedule && (
              <div className="grid gap-2 sm:grid-cols-3">
                <Select
                  value={draft.trigger.frequency ?? "daily"}
                  onValueChange={(frequency) =>
                    setTrigger({ frequency: frequency as "daily" | "weekly" })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Every day</SelectItem>
                    <SelectItem value="weekly">Every week</SelectItem>
                  </SelectContent>
                </Select>
                {draft.trigger.frequency === "weekly" && (
                  <Select
                    value={String(draft.trigger.weekday ?? 1)}
                    onValueChange={(weekday) =>
                      setTrigger({ weekday: Number(weekday) })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((day, index) => (
                        <SelectItem key={day} value={String(index)}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select
                  value={String(draft.trigger.hour ?? 9)}
                  onValueChange={(hour) => setTrigger({ hour: Number(hour) })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, hour) => (
                      <SelectItem key={hour} value={String(hour)}>
                        {String(hour).padStart(2, "0")}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isSchedule && (
              <p className="text-xs text-muted-foreground">
                Times follow {draft.trigger.timeZone || browserTimeZone()}. With
                conditions, the rule sweeps every open task that matches.
              </p>
            )}
          </section>

          {/* ---------- Conditions ---------- */}
          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                If{" "}
                <span className="text-muted-foreground">(all must hold)</span>
              </h3>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  patch({
                    conditions: [
                      ...draft.conditions,
                      { field: "type", op: "is", value: "" },
                    ],
                  })
                }
              >
                <PlusIcon className="size-4" />
                Add
              </Button>
            </div>
            {draft.conditions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No conditions — the rule runs every time it is triggered.
              </p>
            )}
            {draft.conditions.map((condition, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={condition.field}
                  onValueChange={(field) =>
                    setCondition(index, {
                      field: field as AutomationConditionField,
                      value: "",
                    })
                  }
                >
                  <SelectTrigger className="h-9 w-40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_FIELDS.map((field) => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={condition.op}
                  onValueChange={(op) =>
                    setCondition(index, { op: op as AutomationOperator })
                  }
                >
                  <SelectTrigger className="h-9 w-36 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="min-w-0 flex-1">
                  {!VALUELESS.includes(condition.op) &&
                    valueInput(condition.field, condition.value, (value) =>
                      setCondition(index, { value }),
                    )}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0"
                  onClick={() =>
                    patch({
                      conditions: draft.conditions.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  <XIcon className="size-4" />
                  <span className="sr-only">Remove condition</span>
                </Button>
              </div>
            ))}
          </section>

          {/* ---------- Actions ---------- */}
          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Then</h3>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  patch({
                    actions: [
                      ...draft.actions,
                      { type: "add_comment", text: "" },
                    ],
                  })
                }
              >
                <PlusIcon className="size-4" />
                Add
              </Button>
            </div>
            {draft.actions.map((action, index) => (
              <div key={index} className="flex items-start gap-2">
                <Select
                  value={action.type}
                  onValueChange={(type) =>
                    patch({
                      actions: draft.actions.map((current, i) =>
                        i === index
                          ? { type: type as AutomationActionType }
                          : current,
                      ),
                    })
                  }
                >
                  <SelectTrigger className="h-9 w-44 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="min-w-0 flex-1">
                  <ActionValue
                    action={action}
                    onChange={(changes) => setAction(index, changes)}
                    valueInput={valueInput}
                    people={people}
                  />
                </div>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0"
                  disabled={draft.actions.length === 1}
                  onClick={() =>
                    patch({
                      actions: draft.actions.filter((_, i) => i !== index),
                    })
                  }
                >
                  <XIcon className="size-4" />
                  <span className="sr-only">Remove action</span>
                </Button>
              </div>
            ))}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!draft.name.trim() || save.isPending}
          >
            {rule ? "Save rule" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The right-hand side of one action row, which differs per action */
function ActionValue({
  action,
  onChange,
  valueInput,
  people,
}: {
  action: AutomationAction;
  onChange: (changes: Partial<AutomationAction>) => void;
  valueInput: (
    field: string,
    value: string | undefined,
    onChange: (next: string) => void,
    options?: { allowActor?: boolean; allowSprintAliases?: boolean },
  ) => React.ReactNode;
  people: { _id: string; username: string; fullName?: string }[];
}) {
  switch (action.type) {
    case "set_status":
      return valueInput("status", action.value, (value) => onChange({ value }));
    case "set_priority":
      return valueInput("priority", action.value, (value) =>
        onChange({ value }),
      );
    case "set_assignee":
      return valueInput(
        "assignee",
        action.value ?? "unassigned",
        (value) => onChange({ value }),
        { allowActor: true },
      );
    case "set_sprint":
      return valueInput(
        "sprint",
        action.value ?? "backlog",
        (value) => onChange({ value }),
        { allowSprintAliases: true },
      );
    case "set_due_date":
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="h-9 w-24"
            value={action.days ?? 0}
            onChange={(event) => onChange({ days: Number(event.target.value) })}
          />
          <span className="text-sm text-muted-foreground">days from today</span>
        </div>
      );
    case "add_labels":
    case "remove_labels":
      return (
        <Input
          className="h-9"
          value={action.labels?.join(", ") ?? ""}
          placeholder="shipped, needs-review"
          onChange={(event) =>
            onChange({
              labels: event.target.value
                .split(",")
                .map((label) => label.trim())
                .filter(Boolean),
            })
          }
        />
      );
    case "add_comment":
      return (
        <Textarea
          rows={2}
          value={action.text ?? ""}
          placeholder="Closed automatically."
          onChange={(event) => onChange({ text: event.target.value })}
        />
      );
    case "create_task":
      return (
        <Input
          className="h-9"
          value={action.text ?? ""}
          placeholder="Title of the new task"
          onChange={(event) => onChange({ text: event.target.value })}
        />
      );
    case "notify":
      return (
        <div className="flex items-center gap-2">
          <Select
            value={action.value ?? "watchers"}
            onValueChange={(value) => onChange({ value })}
          >
            <SelectTrigger className="h-9 w-40 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="watchers">The watchers</SelectItem>
              <SelectItem value="assignee">The assignee</SelectItem>
              {people.map((person) => (
                <SelectItem key={person._id} value={person._id}>
                  {person.fullName || person.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-9"
            value={action.text ?? ""}
            placeholder="What to say"
            onChange={(event) => onChange({ text: event.target.value })}
          />
        </div>
      );
    default:
      return null;
  }
}
