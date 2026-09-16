import mongoose, { type PipelineStage, type Types } from "mongoose";
import { Sprint, SprintStatusEnum } from "../models/sprint.models.js";
import { MAX_ATTACHMENTS_PER_TASK } from "../middlewares/multer.middleware.js";
import { NotificationTypeEnum } from "../models/notification.models.js";
import { Project } from "../models/project.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import { Subtask } from "../models/subtask.models.js";
import {
  TaskActivity,
  TaskActivityTypeEnum,
} from "../models/taskactivity.models.js";
import { Task } from "../models/task.models.js";
import { TaskComment } from "../models/taskcomment.models.js";
import { User } from "../models/user.models.js";
import { logActivity, type ActivityEntry } from "../utils/activity.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  getUploadedFiles,
  removeFiles,
  toAttachment,
} from "../utils/attachments.js";
import {
  AvailableTaskPriorities,
  AvailableTaskStatues,
  TaskStatusEnum,
  UserRolesEnum,
  type TaskPriority,
  type TaskStatus,
} from "../utils/constants.js";
import { notify } from "../utils/notifications.js";
import { toObjectId } from "../utils/object-id.js";
import {
  facetPage,
  fromFacet,
  parseListQuery,
  searchRegex,
} from "../utils/pagination.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { requireUser } from "../utils/request-user.js";
import { extractMentionIds, prepareRichText } from "../utils/rich-text.js";
import {
  dueDateKey,
  parseDueDate,
  parseLabels,
  startOfTodayUtc,
} from "../utils/task-fields.js";

type ProjectParams = { projectId: string };
type TaskParams = ProjectParams & { taskId: string };
type SubtaskParams = ProjectParams & { subTaskId: string };
type AttachmentParams = TaskParams & { attachmentId: string };
type CommentParams = ProjectParams & { commentId: string };

type FacetStages = NonNullable<PipelineStage.Facet["$facet"][string]>;

const USER_SUMMARY = { _id: 1, username: 1, fullName: 1, avatar: 1 } as const;
const AUTHOR_FIELDS = "_id username fullName avatar";
const DAY_MS = 24 * 60 * 60 * 1000;

const isTaskStatus = (value: unknown): value is TaskStatus =>
  AvailableTaskStatues.includes(value as TaskStatus);

const isTaskPriority = (value: unknown): value is TaskPriority =>
  AvailableTaskPriorities.includes(value as TaskPriority);

const displayName = (user: { username: string; fullName?: string }) =>
  user.fullName?.trim() || user.username;

/** $lookup a user reference and replace it with a public user summary */
const lookupUser = (field: string): FacetStages =>
  [
    {
      $lookup: {
        from: "users",
        localField: field,
        foreignField: "_id",
        as: field,
        pipeline: [{ $project: USER_SUMMARY }],
      },
    },
    { $addFields: { [field]: { $arrayElemAt: [`$${field}`, 0] } } },
  ] as FacetStages;

/**
 * Resolves the `assignedTo` body field: empty means unassigned, otherwise the
 * user must be a member of the project.
 */
const resolveAssignee = async (
  projectId: Types.ObjectId,
  assignedTo: unknown,
): Promise<Types.ObjectId | undefined> => {
  if (!assignedTo) return undefined;

  const userId = toObjectId(assignedTo, "assignee");
  const isMember = await ProjectMember.exists({
    project: projectId,
    user: userId,
  });
  if (!isMember) {
    throw new ApiError(400, "Assignee must be a member of this project");
  }
  return userId;
};

/** `{ _id, name }` snapshot of a user for activity history */
const userSnapshot = async (userId: Types.ObjectId | undefined | null) => {
  if (!userId) return null;
  const user = await User.findById(userId, "username fullName").lean();
  return user ? { _id: user._id, name: displayName(user) } : null;
};

/** Resolves the `sprint` body field: empty / "backlog" = no sprint */
const resolveSprint = async (
  projectId: Types.ObjectId,
  value: unknown,
): Promise<Types.ObjectId | undefined> => {
  if (!value || value === "backlog") return undefined;
  const sprint = await Sprint.findOne(
    { _id: toObjectId(value, "sprint"), project: projectId },
    "_id status",
  ).lean();
  if (!sprint) {
    throw new ApiError(400, "Sprint not found in this project");
  }
  if (sprint.status === SprintStatusEnum.COMPLETED) {
    throw new ApiError(400, "Tasks can't be added to a completed sprint");
  }
  return sprint._id;
};

/** `{ _id, name }` snapshot of a sprint for activity history (null = backlog) */
const sprintSnapshot = async (sprintId: Types.ObjectId | undefined | null) => {
  if (!sprintId) return null;
  const sprint = await Sprint.findById(sprintId, "name").lean();
  return sprint ? { _id: sprint._id, name: sprint.name } : null;
};

const findTaskInProject = async (projectId: string, taskId: string) => {
  const task = await Task.findOne({
    _id: toObjectId(taskId, "task id"),
    project: toObjectId(projectId, "project id"),
  });
  if (!task) {
    throw new ApiError(404, "Task not found");
  }
  return task;
};

const findSubtaskInProject = async (projectId: string, subTaskId: string) => {
  const subtask = await Subtask.findById(toObjectId(subTaskId, "subtask id"));
  const task =
    subtask &&
    (await Task.findOne(
      { _id: subtask.task, project: toObjectId(projectId, "project id") },
      "_id project",
    ));
  if (!subtask || !task) {
    throw new ApiError(404, "Subtask not found");
  }
  return { subtask, task };
};

const projectSummary = async (projectId: Types.ObjectId) => {
  const project = await Project.findById(projectId, "name").lean();
  return { _id: projectId, name: project?.name ?? "a project" };
};

const notifyAssignee = async (
  actor: AuthenticatedUser,
  task: { _id: Types.ObjectId; title: string; project: Types.ObjectId },
  assigneeId: Types.ObjectId | undefined,
) => {
  if (!assigneeId) return;
  await notify({
    type: NotificationTypeEnum.TASK_ASSIGNED,
    recipients: [assigneeId],
    actor,
    project: await projectSummary(task.project),
    task,
  });
};

// ---------- Tasks ----------

const TASK_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "title",
  "dueDate",
  "priority",
] as const;

/**
 * GET /tasks/:projectId?status&assignee=me|unassigned|<userId>&priority
 *   &label&due=overdue|week|none&search
 *   &sort=createdAt|updatedAt|title|dueDate|priority&order&page&limit
 * The board loads each status column separately, page by page. `summary`
 * always describes the whole project, ignoring filters.
 */
const getTasks = asyncHandler<ProjectParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const projectId = toObjectId(req.params.projectId, "project id");
  const query = parseListQuery(req.query, {
    sortFields: TASK_SORT_FIELDS,
    defaultSort: "createdAt",
    defaultLimit: 20,
  });
  const today = startOfTodayUtc();

  const filter: Record<string, unknown> = { project: projectId };
  if (isTaskStatus(req.query.status)) {
    filter.status = req.query.status;
  }
  if (isTaskPriority(req.query.priority)) {
    filter.priority = req.query.priority;
  }
  if (typeof req.query.label === "string" && req.query.label) {
    filter.labels = req.query.label.toLowerCase();
  }
  if (req.query.due === "overdue") {
    filter.dueDate = { $lt: today };
    filter.status = filter.status ?? { $ne: TaskStatusEnum.DONE };
  } else if (req.query.due === "week") {
    filter.dueDate = {
      $gte: today,
      $lt: new Date(today.getTime() + 7 * DAY_MS),
    };
  } else if (req.query.due === "none") {
    filter.dueDate = { $exists: false };
  }

  const sprintParam = req.query.sprint;
  if (sprintParam === "backlog") {
    filter.sprint = { $exists: false };
  } else if (sprintParam === "active") {
    const active = await Sprint.findOne(
      { project: projectId, status: SprintStatusEnum.ACTIVE },
      "_id",
    ).lean();
    // No active sprint: match nothing
    filter.sprint = active?._id ?? new mongoose.Types.ObjectId();
  } else if (typeof sprintParam === "string" && sprintParam) {
    filter.sprint = toObjectId(sprintParam, "sprint");
  }

  const assignee = req.query.assignee;
  if (assignee === "me") {
    filter.assignedTo = currentUser._id;
  } else if (assignee === "unassigned") {
    filter.assignedTo = { $exists: false };
  } else if (typeof assignee === "string" && assignee) {
    filter.assignedTo = toObjectId(assignee, "assignee");
  }
  if (query.search) {
    filter.$or = [
      { title: searchRegex(query.search) },
      { description: searchRegex(query.search) },
      { labels: searchRegex(query.search) },
    ];
  }

  // Tasks without a due date always sort last
  const noDueDate =
    query.sortOrder === 1 ? new Date(8.64e15) : new Date(-8.64e15);
  const sortKey = {
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    title: "titleLower",
    dueDate: "dueSort",
    priority: "priorityRank",
  }[query.sortField];

  const [page, summary] = await Promise.all([
    Task.aggregate([
      { $match: filter },
      {
        $addFields: {
          titleLower: { $toLower: "$title" },
          dueSort: { $ifNull: ["$dueDate", noDueDate] },
          priorityRank: {
            $indexOfArray: [
              AvailableTaskPriorities,
              { $ifNull: ["$priority", "medium"] },
            ],
          },
        },
      },
      { $sort: { [sortKey]: query.sortOrder, _id: 1 } },
      facetPage(query, [
        ...lookupUser("assignedTo"),
        {
          $lookup: {
            from: "subtasks",
            localField: "_id",
            foreignField: "task",
            as: "subtasks",
            pipeline: [{ $project: { isCompleted: 1 } }],
          },
        },
        {
          $lookup: {
            from: "taskcomments",
            localField: "_id",
            foreignField: "task",
            as: "comments",
            pipeline: [{ $project: { _id: 1 } }],
          },
        },
        {
          $addFields: {
            priority: { $ifNull: ["$priority", "medium"] },
            labels: { $ifNull: ["$labels", []] },
            subtaskCount: { $size: "$subtasks" },
            completedSubtaskCount: {
              $size: {
                $filter: { input: "$subtasks", cond: "$$this.isCompleted" },
              },
            },
            attachmentCount: { $size: "$attachments" },
            commentCount: { $size: "$comments" },
          },
        },
        {
          $project: {
            subtasks: 0,
            attachments: 0,
            comments: 0,
            titleLower: 0,
            dueSort: 0,
            priorityRank: 0,
          },
        },
      ] as FacetStages),
    ]),
    Task.aggregate([
      { $match: { project: projectId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          todo: {
            $sum: { $cond: [{ $eq: ["$status", TaskStatusEnum.TODO] }, 1, 0] },
          },
          in_progress: {
            $sum: {
              $cond: [{ $eq: ["$status", TaskStatusEnum.IN_PROGRESS] }, 1, 0],
            },
          },
          done: {
            $sum: { $cond: [{ $eq: ["$status", TaskStatusEnum.DONE] }, 1, 0] },
          },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: [{ $ifNull: ["$dueDate", noDueDate] }, today] },
                    { $ne: [{ $type: "$dueDate" }, "missing"] },
                    { $ne: ["$status", TaskStatusEnum.DONE] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          assignedToMeOpen: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$assignedTo", currentUser._id] },
                    { $ne: ["$status", TaskStatusEnum.DONE] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $project: { _id: 0 } },
    ]),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...fromFacet(page, query),
        summary: summary[0] ?? {
          total: 0,
          todo: 0,
          in_progress: 0,
          done: 0,
          overdue: 0,
          assignedToMeOpen: 0,
        },
      },
      "Tasks fetched successfully",
    ),
  );
});

/** GET /tasks/:projectId/labels — every label used in the project */
const getProjectLabels = asyncHandler<ProjectParams>(async (req, res) => {
  const labels = await Task.distinct("labels", {
    project: toObjectId(req.params.projectId, "project id"),
  });
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        (labels as string[]).filter(Boolean).sort(),
        "Labels fetched",
      ),
    );
});

const createTask = asyncHandler<ProjectParams>(async (req, res) => {
  const { title, description, assignedTo, status, priority } = req.body;
  const projectId = toObjectId(req.params.projectId, "project id");
  const currentUser = requireUser(req);
  const files = getUploadedFiles(req);

  try {
    const assignee = await resolveAssignee(projectId, assignedTo);
    const task = await Task.create({
      title,
      description,
      project: projectId,
      assignedTo: assignee,
      status,
      priority,
      dueDate: parseDueDate(req.body.dueDate) ?? undefined,
      labels: parseLabels(req.body.labels) ?? [],
      sprint: await resolveSprint(projectId, req.body.sprint),
      assignedBy: currentUser._id,
      attachments: files.map((file) => toAttachment(req, file)),
    });

    await logActivity(task, currentUser._id, [
      { type: TaskActivityTypeEnum.CREATED, to: task.status },
    ]);
    await notifyAssignee(currentUser, task, assignee);

    return res
      .status(201)
      .json(new ApiResponse(201, task, "Task created successfully"));
  } catch (error) {
    await removeFiles(files.map((file) => file.path));
    throw error;
  }
});

const getTaskById = asyncHandler<TaskParams>(async (req, res) => {
  const { projectId, taskId } = req.params;

  const task = await Task.aggregate([
    {
      $match: {
        _id: toObjectId(taskId, "task id"),
        project: toObjectId(projectId, "project id"),
      },
    },
    ...lookupUser("assignedTo"),
    ...lookupUser("assignedBy"),
    {
      $lookup: {
        from: "subtasks",
        localField: "_id",
        foreignField: "task",
        as: "subtasks",
        pipeline: [{ $sort: { createdAt: 1 } }, ...lookupUser("createdBy")],
      },
    },
    {
      $addFields: {
        priority: { $ifNull: ["$priority", "medium"] },
        labels: { $ifNull: ["$labels", []] },
      },
    },
    { $project: { "attachments.localPath": 0 } },
  ] as PipelineStage[]);

  if (!task[0]) {
    throw new ApiError(404, "Task not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, task[0], "Task fetched successfully"));
});

const updateTask = asyncHandler<TaskParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const { title, description, status, priority } = req.body;
  const files = getUploadedFiles(req);

  try {
    const task = await findTaskInProject(
      req.params.projectId,
      req.params.taskId,
    );
    const history: ActivityEntry[] = [];
    let newAssignee: Types.ObjectId | undefined;

    if (title !== undefined && title !== task.title) {
      history.push({
        type: TaskActivityTypeEnum.TITLE_CHANGED,
        from: task.title,
        to: title,
      });
      task.title = title;
    }
    if (description !== undefined && description !== (task.description ?? "")) {
      history.push({ type: TaskActivityTypeEnum.DESCRIPTION_CHANGED });
      task.description = description;
    }
    if (status !== undefined && status !== task.status) {
      history.push({
        type: TaskActivityTypeEnum.STATUS_CHANGED,
        from: task.status,
        to: status,
      });
      task.status = status;
    }
    if (priority !== undefined && priority !== task.priority) {
      history.push({
        type: TaskActivityTypeEnum.PRIORITY_CHANGED,
        from: task.priority ?? "medium",
        to: priority,
      });
      task.priority = priority;
    }
    if ("assignedTo" in req.body) {
      const assignee = await resolveAssignee(task.project, req.body.assignedTo);
      if (String(assignee ?? "") !== String(task.assignedTo ?? "")) {
        history.push({
          type: TaskActivityTypeEnum.ASSIGNEE_CHANGED,
          from: await userSnapshot(task.assignedTo),
          to: await userSnapshot(assignee),
        });
        task.assignedTo = assignee;
        newAssignee = assignee;
      }
    }

    if ("sprint" in req.body) {
      const sprint = await resolveSprint(task.project, req.body.sprint);
      if (String(sprint ?? "") !== String(task.sprint ?? "")) {
        history.push({
          type: TaskActivityTypeEnum.SPRINT_CHANGED,
          from: await sprintSnapshot(task.sprint),
          to: await sprintSnapshot(sprint),
        });
        task.sprint = sprint;
      }
    }

    const dueDate = parseDueDate(req.body.dueDate);
    if (
      dueDate !== undefined &&
      dueDateKey(dueDate) !== dueDateKey(task.dueDate)
    ) {
      history.push({
        type: TaskActivityTypeEnum.DUE_DATE_CHANGED,
        from: dueDateKey(task.dueDate),
        to: dueDateKey(dueDate),
      });
      task.dueDate = dueDate ?? undefined;
    }

    const labels = parseLabels(req.body.labels);
    const currentLabels = task.labels ?? [];
    if (
      labels !== undefined &&
      [...labels].sort().join() !== [...currentLabels].sort().join()
    ) {
      history.push({
        type: TaskActivityTypeEnum.LABELS_CHANGED,
        from: currentLabels,
        to: labels,
      });
      task.labels = labels;
    }

    if (files.length > 0) {
      if (task.attachments.length + files.length > MAX_ATTACHMENTS_PER_TASK) {
        throw new ApiError(
          400,
          `A task can have at most ${MAX_ATTACHMENTS_PER_TASK} attachments`,
        );
      }
      task.attachments.push(...files.map((file) => toAttachment(req, file)));
      history.push({
        type: TaskActivityTypeEnum.ATTACHMENT_ADDED,
        name: files.map((file) => file.originalname).join(", "),
        to: files.length,
      });
    }

    await task.save();
    await logActivity(task, currentUser._id, history);
    await notifyAssignee(currentUser, task, newAssignee);

    return res
      .status(200)
      .json(new ApiResponse(200, task, "Task updated successfully"));
  } catch (error) {
    await removeFiles(files.map((file) => file.path));
    throw error;
  }
});

const deleteTask = asyncHandler<TaskParams>(async (req, res) => {
  const task = await findTaskInProject(req.params.projectId, req.params.taskId);

  await Promise.all([
    task.deleteOne(),
    Subtask.deleteMany({ task: task._id }),
    TaskComment.deleteMany({ task: task._id }),
    TaskActivity.deleteMany({ task: task._id }),
  ]);
  await removeFiles(task.attachments.map((file) => file.localPath));

  return res
    .status(200)
    .json(new ApiResponse(200, task, "Task deleted successfully"));
});

const deleteAttachment = asyncHandler<AttachmentParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const { projectId, taskId, attachmentId } = req.params;
  const task = await findTaskInProject(projectId, taskId);
  const attachmentOid = toObjectId(attachmentId, "attachment id");

  const attachment = task.attachments.find((file) =>
    file._id?.equals(attachmentOid),
  );
  if (!attachment) {
    throw new ApiError(404, "Attachment not found");
  }

  await Task.updateOne(
    { _id: task._id },
    { $pull: { attachments: { _id: attachmentOid } } },
  );
  await removeFiles([attachment.localPath]);
  await logActivity(task, currentUser._id, [
    { type: TaskActivityTypeEnum.ATTACHMENT_REMOVED, name: attachment.name },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Attachment deleted successfully"));
});

/** GET /tasks/:projectId/t/:taskId/activity?page&limit — newest first */
const getTaskActivity = asyncHandler<TaskParams>(async (req, res) => {
  const task = await findTaskInProject(req.params.projectId, req.params.taskId);
  const query = parseListQuery(req.query, {
    sortFields: ["createdAt"] as const,
    defaultSort: "createdAt",
    defaultLimit: 20,
    maxLimit: 50,
  });

  const result = await TaskActivity.aggregate([
    { $match: { task: task._id } },
    { $sort: { createdAt: query.sortOrder, _id: query.sortOrder } },
    facetPage(query, lookupUser("actor")),
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, fromFacet(result, query), "Activity fetched"));
});

// ---------- Subtasks ----------

const createSubTask = asyncHandler<TaskParams>(async (req, res) => {
  const { title } = req.body;
  const currentUser = requireUser(req);
  const task = await findTaskInProject(req.params.projectId, req.params.taskId);

  const subtask = await Subtask.create({
    title,
    task: task._id,
    createdBy: currentUser._id,
  });
  await logActivity(task, currentUser._id, [
    { type: TaskActivityTypeEnum.SUBTASK_ADDED, name: subtask.title },
  ]);

  return res
    .status(201)
    .json(new ApiResponse(201, subtask, "Subtask created successfully"));
});

const updateSubTask = asyncHandler<SubtaskParams>(async (req, res) => {
  const { title, isCompleted } = req.body;
  const currentUser = requireUser(req);
  const { subtask, task } = await findSubtaskInProject(
    req.params.projectId,
    req.params.subTaskId,
  );

  // Members may only mark subtasks complete / incomplete
  const canEditDetails = currentUser.role !== UserRolesEnum.MEMBER;
  if (title !== undefined && title !== subtask.title && !canEditDetails) {
    throw new ApiError(
      403,
      "Members can only update the completion status of a subtask",
    );
  }

  const history: ActivityEntry[] = [];
  if (isCompleted !== undefined && isCompleted !== subtask.isCompleted) {
    history.push({
      type: isCompleted
        ? TaskActivityTypeEnum.SUBTASK_COMPLETED
        : TaskActivityTypeEnum.SUBTASK_REOPENED,
      name: title ?? subtask.title,
    });
  }

  if (title !== undefined) subtask.title = title;
  if (isCompleted !== undefined) subtask.isCompleted = isCompleted;
  await subtask.save();
  await logActivity(task, currentUser._id, history);

  return res
    .status(200)
    .json(new ApiResponse(200, subtask, "Subtask updated successfully"));
});

const deleteSubTask = asyncHandler<SubtaskParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const { subtask, task } = await findSubtaskInProject(
    req.params.projectId,
    req.params.subTaskId,
  );
  await subtask.deleteOne();
  await logActivity(task, currentUser._id, [
    { type: TaskActivityTypeEnum.SUBTASK_DELETED, name: subtask.title },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, subtask, "Subtask deleted successfully"));
});

// ---------- Comments ----------

/** GET /tasks/:projectId/t/:taskId/comments?page&limit&order (newest first) */
const getTaskComments = asyncHandler<TaskParams>(async (req, res) => {
  const task = await findTaskInProject(req.params.projectId, req.params.taskId);
  const query = parseListQuery(req.query, {
    sortFields: ["createdAt"] as const,
    defaultSort: "createdAt",
    defaultLimit: 10,
    maxLimit: 50,
  });

  const result = await TaskComment.aggregate([
    { $match: { task: task._id } },
    { $sort: { createdAt: query.sortOrder, _id: query.sortOrder } },
    facetPage(query, [
      ...lookupUser("author"),
      { $project: { bodyText: 0 } },
    ] as FacetStages),
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, fromFacet(result, query), "Comments fetched"));
});

/**
 * Notifies @mentioned users, then everyone following the task (assignee,
 * reporter and earlier commenters) who wasn't already mentioned.
 */
const notifyAboutComment = async (
  actor: AuthenticatedUser,
  task: {
    _id: Types.ObjectId;
    title: string;
    project: Types.ObjectId;
    assignedTo?: Types.ObjectId;
    assignedBy?: Types.ObjectId;
  },
  mentionIds: string[],
  excerpt: string,
  { includeFollowers }: { includeFollowers: boolean },
) => {
  const project = await projectSummary(task.project);

  const mentioned = await notify({
    type: NotificationTypeEnum.MENTIONED,
    recipients: mentionIds,
    actor,
    project,
    task,
    excerpt,
  });

  if (!includeFollowers) return;

  const commenters = await TaskComment.distinct("author", { task: task._id });
  const followers = [task.assignedTo, task.assignedBy, ...commenters]
    .filter(Boolean)
    .map(String)
    .filter((id) => !mentioned.includes(id));

  await notify({
    type: NotificationTypeEnum.TASK_COMMENTED,
    recipients: followers,
    actor,
    project,
    task,
    excerpt,
  });
};

/** Every project member can comment */
const addTaskComment = asyncHandler<TaskParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const task = await findTaskInProject(req.params.projectId, req.params.taskId);
  const { html, text } = prepareRichText(req.body.body);

  const comment = await TaskComment.create({
    task: task._id,
    project: task.project,
    author: currentUser._id,
    body: html,
    bodyText: text,
  });
  await comment.populate("author", AUTHOR_FIELDS);

  await logActivity(task, currentUser._id, [
    { type: TaskActivityTypeEnum.COMMENT_ADDED },
  ]);
  await notifyAboutComment(currentUser, task, extractMentionIds(html), text, {
    includeFollowers: true,
  });

  return res.status(201).json(new ApiResponse(201, comment, "Comment added"));
});

const findCommentInProject = async (projectId: string, commentId: string) => {
  const comment = await TaskComment.findOne({
    _id: toObjectId(commentId, "comment id"),
    project: toObjectId(projectId, "project id"),
  });
  if (!comment) {
    throw new ApiError(404, "Comment not found");
  }
  return comment;
};

/** Only the author can edit their comment */
const updateTaskComment = asyncHandler<CommentParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const comment = await findCommentInProject(
    req.params.projectId,
    req.params.commentId,
  );

  if (!comment.author.equals(currentUser._id)) {
    throw new ApiError(403, "You can only edit your own comments");
  }

  const previousMentions = extractMentionIds(comment.body);
  const { html, text } = prepareRichText(req.body.body);
  comment.body = html;
  comment.bodyText = text;
  comment.editedAt = new Date();
  await comment.save();
  await comment.populate("author", AUTHOR_FIELDS);

  // Only people newly mentioned by the edit are notified
  const newMentions = extractMentionIds(html).filter(
    (id) => !previousMentions.includes(id),
  );
  if (newMentions.length > 0) {
    const task = await Task.findById(
      comment.task,
      "_id title project assignedTo assignedBy",
    );
    if (task) {
      await notifyAboutComment(currentUser, task, newMentions, text, {
        includeFollowers: false,
      });
    }
  }

  return res.status(200).json(new ApiResponse(200, comment, "Comment updated"));
});

/** Authors can delete their own comments; admins and project admins any */
const deleteTaskComment = asyncHandler<CommentParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const comment = await findCommentInProject(
    req.params.projectId,
    req.params.commentId,
  );

  const isAuthor = comment.author.equals(currentUser._id);
  const isModerator = currentUser.role !== UserRolesEnum.MEMBER;
  if (!isAuthor && !isModerator) {
    throw new ApiError(403, "You can only delete your own comments");
  }

  await comment.deleteOne();

  return res.status(200).json(new ApiResponse(200, {}, "Comment deleted"));
});

// ---------- My work ----------

const MY_TASK_SORT_FIELDS = ["dueDate", "priority", "updatedAt"] as const;

/**
 * GET /tasks/me?status=open|done|all&priority&search&sort=dueDate|priority|updatedAt
 *   &order&page&limit
 * Tasks assigned to the current user across every project they belong to.
 */
const getMyTasks = asyncHandler(async (req, res) => {
  const currentUser = requireUser(req);
  const query = parseListQuery(req.query, {
    sortFields: MY_TASK_SORT_FIELDS,
    defaultSort: "dueDate",
    defaultOrder: "asc",
    defaultLimit: 50,
    maxLimit: 100,
  });
  const today = startOfTodayUtc();

  const projectIds = await ProjectMember.distinct("project", {
    user: currentUser._id,
  });
  const base = { assignedTo: currentUser._id, project: { $in: projectIds } };

  const filter: Record<string, unknown> = { ...base };
  if (req.query.status === "done") {
    filter.status = TaskStatusEnum.DONE;
  } else if (req.query.status !== "all") {
    filter.status = { $ne: TaskStatusEnum.DONE };
  }
  if (isTaskPriority(req.query.priority)) {
    filter.priority = req.query.priority;
  }
  if (query.search) {
    filter.$or = [
      { title: searchRegex(query.search) },
      { description: searchRegex(query.search) },
    ];
  }

  const noDueDate =
    query.sortOrder === 1 ? new Date(8.64e15) : new Date(-8.64e15);
  const sortKey = {
    dueDate: "dueSort",
    priority: "priorityRank",
    updatedAt: "updatedAt",
  }[query.sortField];
  const notDone = { $ne: ["$status", TaskStatusEnum.DONE] };
  const hasDue = { $ne: [{ $type: "$dueDate" }, "missing"] };

  const [page, summary] = await Promise.all([
    Task.aggregate([
      { $match: filter },
      {
        $addFields: {
          dueSort: { $ifNull: ["$dueDate", noDueDate] },
          priorityRank: {
            $indexOfArray: [
              AvailableTaskPriorities,
              { $ifNull: ["$priority", "medium"] },
            ],
          },
        },
      },
      { $sort: { [sortKey]: query.sortOrder, updatedAt: -1, _id: 1 } },
      facetPage(query, [
        {
          $lookup: {
            from: "projects",
            localField: "project",
            foreignField: "_id",
            as: "project",
            pipeline: [{ $project: { _id: 1, name: 1 } }],
          },
        },
        { $unwind: "$project" },
        {
          $addFields: {
            priority: { $ifNull: ["$priority", "medium"] },
            labels: { $ifNull: ["$labels", []] },
            attachmentCount: { $size: "$attachments" },
          },
        },
        {
          $project: {
            attachments: 0,
            dueSort: 0,
            priorityRank: 0,
            description: 0,
          },
        },
      ] as FacetStages),
    ]),
    Task.aggregate([
      { $match: base },
      {
        $group: {
          _id: null,
          open: { $sum: { $cond: [notDone, 1, 0] } },
          done: { $sum: { $cond: [notDone, 0, 1] } },
          overdue: {
            $sum: {
              $cond: [
                { $and: [notDone, hasDue, { $lt: ["$dueDate", today] }] },
                1,
                0,
              ],
            },
          },
          dueThisWeek: {
            $sum: {
              $cond: [
                {
                  $and: [
                    notDone,
                    hasDue,
                    { $gte: ["$dueDate", today] },
                    {
                      $lt: ["$dueDate", new Date(today.getTime() + 7 * DAY_MS)],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $project: { _id: 0 } },
    ]),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...fromFacet(page, query),
        summary: summary[0] ?? { open: 0, done: 0, overdue: 0, dueThisWeek: 0 },
      },
      "Your tasks",
    ),
  );
});

export {
  getMyTasks,
  addTaskComment,
  createSubTask,
  createTask,
  deleteAttachment,
  deleteSubTask,
  deleteTask,
  deleteTaskComment,
  getProjectLabels,
  getTaskActivity,
  getTaskById,
  getTaskComments,
  getTasks,
  updateSubTask,
  updateTask,
  updateTaskComment,
};
