import type { NotificationType } from "@/types/models";

/**
 * How each notification reads: "Asha changed the status of SPST-3 Title" or,
 * for reminders the app sends itself, "SPST-3 Title is overdue".
 */
const phrases: Record<
  NotificationType,
  { verb?: string; suffix?: string; system?: boolean }
> = {
  task_assigned: { verb: "assigned you to" },
  task_commented: { verb: "commented on" },
  mentioned: { verb: "mentioned you in" },
  task_status_changed: { verb: "changed the status of" },
  task_linked: { verb: "linked" },
  task_due_soon: { suffix: "is due today", system: true },
  task_overdue: { suffix: "is overdue", system: true },
};

export interface NotificationParts {
  /** Who did it; missing for reminders */
  actor?: string;
  verb?: string;
  task: string;
  suffix?: string;
}

export function notificationParts(notification: {
  type: NotificationType;
  actorName?: string;
  taskKey?: string;
  taskTitle?: string;
}): NotificationParts {
  const phrase = phrases[notification.type] ?? { verb: "updated" };
  const task =
    [notification.taskKey, notification.taskTitle].filter(Boolean).join(" ") ||
    "a task";
  return {
    actor: phrase.system ? undefined : (notification.actorName ?? "Someone"),
    verb: phrase.verb,
    task,
    suffix: phrase.suffix,
  };
}

/** Plain sentence, e.g. for toasts */
export function notificationSentence(
  notification: Parameters<typeof notificationParts>[0],
) {
  const { actor, verb, task, suffix } = notificationParts(notification);
  return [actor, verb, task, suffix].filter(Boolean).join(" ");
}
