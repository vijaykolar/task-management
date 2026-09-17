import type { Types } from "mongoose";
import {
  Notification,
  NotificationTypeEnum,
  type NotificationType,
} from "../models/notification.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import { User } from "../models/user.models.js";
import {
  mentionedMailgenContent,
  sendEmail,
  taskAssignedMailgenContent,
} from "./mail.js";
import { frontendUrl } from "./urls.js";
import { publishToUsers } from "./realtime.js";

interface NotifyOptions {
  type: NotificationType;
  recipients: (Types.ObjectId | string | undefined | null)[];
  /** Omit for reminders the app sends on its own */
  actor?: { _id: Types.ObjectId; username: string; fullName?: string };
  project: { _id: Types.ObjectId; name: string };
  task?: { _id: Types.ObjectId; title: string; key?: string };
  excerpt?: string;
}

const EXCERPT_LENGTH = 160;

const displayName = (user: { username: string; fullName?: string }) =>
  user.fullName?.trim() || user.username;

// Only assignments and mentions are worth an email; everything else (comments,
// watched-task updates, due reminders) stays in the app
const EMAIL_TYPES: NotificationType[] = [
  NotificationTypeEnum.TASK_ASSIGNED,
  NotificationTypeEnum.MENTIONED,
];

export const taskUrl = (projectId: Types.ObjectId, taskId: Types.ObjectId) =>
  `${frontendUrl()}/projects/${projectId}?tab=tasks&task=${taskId}`;

/**
 * Creates in-app notifications (and, for some types, emails) for the given
 * users. The actor and anyone who is no longer a project member are skipped.
 * Never throws: notifications must not break the action that caused them.
 * Returns the ids that were notified.
 */
export const notify = async (options: NotifyOptions): Promise<string[]> => {
  try {
    const actorId = options.actor ? String(options.actor._id) : null;
    const candidateIds = [
      ...new Set(
        options.recipients
          .filter((id): id is Types.ObjectId | string => !!id)
          .map(String),
      ),
    ].filter((id) => id !== actorId);
    if (candidateIds.length === 0) return [];

    const memberships = await ProjectMember.find(
      { project: options.project._id, user: { $in: candidateIds } },
      "user",
    ).lean();
    const recipientIds = memberships.map((m) => String(m.user));
    if (recipientIds.length === 0) return [];

    const excerpt =
      options.excerpt && options.excerpt.length > EXCERPT_LENGTH
        ? `${options.excerpt.slice(0, EXCERPT_LENGTH).trimEnd()}…`
        : options.excerpt;

    await Notification.insertMany(
      recipientIds.map((recipient) => ({
        recipient,
        actor: options.actor?._id,
        type: options.type,
        project: options.project._id,
        task: options.task?._id,
        projectName: options.project.name,
        taskTitle: options.task?.title,
        taskKey: options.task?.key,
        excerpt,
      })),
    );

    publishToUsers(recipientIds, {
      type: "notification",
      kind: options.type,
      actorName: options.actor ? displayName(options.actor) : undefined,
      projectId: String(options.project._id),
      projectName: options.project.name,
      taskId: options.task ? String(options.task._id) : undefined,
      taskTitle: options.task?.title,
      taskKey: options.task?.key,
      excerpt,
    });

    if (EMAIL_TYPES.includes(options.type) && options.task && options.actor) {
      void sendNotificationEmails(options, recipientIds, excerpt);
    }
    return recipientIds;
  } catch (error) {
    console.error("Failed to create notifications:", error);
    return [];
  }
};

const sendNotificationEmails = async (
  options: NotifyOptions,
  recipientIds: string[],
  excerpt: string | undefined,
) => {
  const users = await User.find(
    {
      _id: { $in: recipientIds },
      emailNotifications: { $ne: false },
      isEmailVerified: true,
    },
    "email username",
  ).lean();

  const details = {
    actorName: displayName(options.actor!),
    projectName: options.project.name,
    taskTitle: options.task!.title,
    taskUrl: taskUrl(options.project._id, options.task!._id),
  };

  await Promise.all(
    users.map((user) =>
      sendEmail({
        email: user.email,
        subject:
          options.type === NotificationTypeEnum.MENTIONED
            ? `${details.actorName} mentioned you on "${details.taskTitle}"`
            : `${details.actorName} assigned you "${details.taskTitle}"`,
        mailgenContent:
          options.type === NotificationTypeEnum.MENTIONED
            ? mentionedMailgenContent(user.username, {
                ...details,
                excerpt: excerpt ?? "",
              })
            : taskAssignedMailgenContent(user.username, details),
      }).catch((error) =>
        console.error(`Failed to email notification to ${user.email}:`, error),
      ),
    ),
  );
};
