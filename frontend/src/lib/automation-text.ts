import type {
  AutomationAction,
  AutomationCondition,
  AutomationRule,
  AutomationTrigger,
} from "@/types/models";

/**
 * Turns a stored rule into the sentence people read in the rule list. Names
 * come from the project, so a status or a person reads as itself, not as an id.
 */
export interface AutomationNames {
  status: (key: string) => string;
  user: (id: string) => string;
  sprint: (id: string) => string;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const FIELD_LABELS: Record<string, string> = {
  status: "status",
  assignee: "assignee",
  priority: "priority",
  sprint: "sprint",
  dueDate: "due date",
  labels: "labels",
  type: "type",
  statusCategory: "status category",
  storyPoints: "story points",
  epic: "epic",
};

const OPERATOR_LABELS: Record<string, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  not_contains: "doesn't contain",
  is_empty: "is empty",
  is_not_empty: "is set",
  gt: "is more than",
  lt: "is less than",
};

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** The value of a trigger or condition, named rather than shown as an id */
const valueLabel = (
  field: string | undefined,
  value: string | undefined,
  names: AutomationNames,
) => {
  if (!value) return "";
  if (field === "status") return names.status(value);
  if (field === "assignee") {
    if (value === "unassigned") return "nobody";
    if (value === "actor") return "whoever made the change";
    return names.user(value);
  }
  if (field === "sprint") {
    if (value === "backlog") return "the backlog";
    if (value === "active") return "the active sprint";
    if (value === "next") return "the next sprint";
    return names.sprint(value);
  }
  return value;
};

export function describeTrigger(
  trigger: AutomationTrigger,
  names: AutomationNames,
) {
  switch (trigger.event) {
    case "task_created":
      return "When a task is created";
    case "task_changed": {
      const field = trigger.field ? FIELD_LABELS[trigger.field] : "anything";
      if (!trigger.field) return "When anything on a task changes";
      const to = valueLabel(trigger.field, trigger.to, names);
      const from = valueLabel(trigger.field, trigger.from, names);
      if (to && from) return `When ${field} goes from ${from} to ${to}`;
      if (to) return `When ${field} becomes ${to}`;
      if (from) return `When ${field} stops being ${from}`;
      return `When ${field} changes`;
    }
    case "sprint_started":
      return "When a sprint starts";
    case "sprint_completed":
      return "When a sprint is completed";
    case "schedule": {
      const at = hourLabel(trigger.hour ?? 9);
      const zone = trigger.timeZone ? ` ${trigger.timeZone}` : "";
      return trigger.frequency === "weekly"
        ? `Every ${WEEKDAYS[trigger.weekday ?? 1]} at ${at}${zone}`
        : `Every day at ${at}${zone}`;
    }
    default:
      return "When something happens";
  }
}

export function describeCondition(
  condition: AutomationCondition,
  names: AutomationNames,
) {
  const field = FIELD_LABELS[condition.field] ?? condition.field;
  const op = OPERATOR_LABELS[condition.op] ?? condition.op;
  if (condition.op === "is_empty" || condition.op === "is_not_empty") {
    return `${field} ${op}`;
  }
  return `${field} ${op} ${valueLabel(condition.field, condition.value, names)}`;
}

export function describeAction(
  action: AutomationAction,
  names: AutomationNames,
) {
  switch (action.type) {
    case "set_status":
      return `set the status to ${names.status(action.value ?? "")}`;
    case "set_assignee":
      return action.value && action.value !== "unassigned"
        ? `assign it to ${valueLabel("assignee", action.value, names)}`
        : "unassign it";
    case "set_priority":
      return `set the priority to ${action.value}`;
    case "set_sprint":
      return `move it to ${valueLabel("sprint", action.value, names)}`;
    case "set_due_date": {
      if (action.days === undefined || action.days === null) {
        return "clear the due date";
      }
      if (action.days === 0) return "make it due today";
      return action.days > 0
        ? `make it due in ${action.days} days`
        : `make it due ${Math.abs(action.days)} days ago`;
    }
    case "add_labels":
      return `add the label${action.labels?.length === 1 ? "" : "s"} ${action.labels?.join(", ")}`;
    case "remove_labels":
      return `remove the label${action.labels?.length === 1 ? "" : "s"} ${action.labels?.join(", ")}`;
    case "add_comment":
      return "post a comment";
    case "notify":
      return action.value === "assignee"
        ? "notify the assignee"
        : action.value && action.value !== "watchers"
          ? `notify ${names.user(action.value)}`
          : "notify the watchers";
    case "create_task":
      return `create a task called "${action.text}"`;
    default:
      return action.type;
  }
}

/** The one-line summary shown under a rule's name */
export function ruleSentence(rule: AutomationRule, names: AutomationNames) {
  const when = describeTrigger(rule.trigger, names);
  const ifs = rule.conditions.length
    ? `, if ${rule.conditions.map((c) => describeCondition(c, names)).join(" and ")}`
    : "";
  const then = rule.actions.map((a) => describeAction(a, names)).join(", ");
  return `${when}${ifs} → ${then}`;
}
