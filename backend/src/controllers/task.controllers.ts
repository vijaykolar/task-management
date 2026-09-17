import mongoose, { type PipelineStage, type Types } from "mongoose";
import { Sprint, SprintStatusEnum } from "../models/sprint.models.js";
import { MAX_ATTACHMENTS_PER_TASK } from "../middlewares/multer.middleware.js";
import { NotificationTypeEnum } from "../models/notification.models.js";
import { Project, type IProjectStatus } from "../models/project.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import { SavedFilter } from "../models/savedfilter.models.js";
import { Subtask } from "../models/subtask.models.js";
import {
  REPORT_ACTIVITY_TYPES,
  TaskActivity,
  TaskActivityTypeEnum,
} from "../models/taskactivity.models.js";
import { TaskLink } from "../models/tasklink.models.js";
import { Task, type TaskDocument } from "../models/task.models.js";
import { TaskComment } from "../models/taskcomment.models.js";
import { User } from "../models/user.models.js";
import {
  logActivities,
  logActivity,
  type ActivityEntry,
} from "../utils/activity.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  getUploadedFiles,
  removeFiles,
  toAttachment,
} from "../utils/attachments.js";
import {
  AvailableStatusCategories,
  AvailableTaskLinkTypes,
  AvailableTaskPriorities,
  AvailableTaskTypes,
  MAX_SAVED_FILTERS,
  StatusCategoryEnum,
  TaskLinkTypeEnum,
  TaskTypeEnum,
  UserRolesEnum,
  type StatusCategory,
  type TaskLinkType,
  type TaskPriority,
  type TaskType,
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
import { sprintSnapshot } from "../utils/sprints.js";
import {
  dueDateKey,
  parseDueDate,
  parseLabels,
  parseStoryPoints,
  startOfTodayUtc,
} from "../utils/task-fields.js";
import {
  TASK_KEY_PATTERN,
  reserveTaskNumber,
  resolveStatus,
} from "../utils/workflow.js";

type ProjectParams = { projectId: string };
type TaskParams = ProjectParams & { taskId: string };
type SubtaskParams = ProjectParams & { subTaskId: string };
type AttachmentParams = TaskParams & { attachmentId: string };
type CommentParams = ProjectParams & { commentId: string };
type LinkParams = ProjectParams & { linkId: string };
type FilterParams = ProjectParams & { filterId: string };

type FacetStages = NonNullable<PipelineStage.Facet["$facet"][string]>;

const USER_SUMMARY = { _id: 1, username: 1, fullName: 1, avatar: 1 } as const;
const AUTHOR_FIELDS = "_id username fullName avatar";
const DAY_MS = 24 * 60 * 60 * 1000;

const isTaskPriority = (value: unknown): value is TaskPriority =>
  AvailableTaskPriorities.includes(value as TaskPriority);

const isTaskType = (value: unknown): value is TaskType =>
  AvailableTaskTypes.includes(value as TaskType);

const isStatusCategory = (value: unknown): value is StatusCategory =>
  AvailableStatusCategories.includes(value as StatusCategory);

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

/** Replaces `epic` with `{ _id, key, title }` */
const lookupEpic = [
  {
    $lookup: {
      from: "tasks",
      localField: "epic",
      foreignField: "_id",
      as: "epic",
      pipeline: [{ $project: { _id: 1, key: 1, title: 1 } }],
    },
  },
  { $addFields: { epic: { $arrayElemAt: ["$epic", 0] } } },
] as FacetStages;

/** Adds `blockedByCount`: unfinished tasks that block this one */
const lookupOpenBlockers = [
  {
    $lookup: {
      from: "tasklinks",
      localField: "_id",
      foreignField: "target",
      as: "blockers",
      pipeline: [
        { $match: { type: TaskLinkTypeEnum.BLOCKS } },
        {
          $lookup: {
            from: "tasks",
            localField: "source",
            foreignField: "_id",
            as: "source",
            pipeline: [{ $project: { statusCategory: 1 } }],
          },
        },
        {
          $match: { "source.statusCategory": { $ne: StatusCategoryEnum.DONE } },
        },
        { $project: { _id: 1 } },
      ],
    },
  },
  { $addFields: { blockedByCount: { $size: "$blockers" } } },
  { $project: { blockers: 0 } },
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

/** `{ _id, key, name }` snapshot of a task for activity history */
const taskSnapshot = async (taskId: Types.ObjectId | undefined | null) => {
  if (!taskId) return null;
  const task = await Task.findById(taskId, "key title").lean();
  return task ? { _id: task._id, key: task.key, name: task.title } : null;
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

/** Resolves the `epic` body field: empty = no epic */
const resolveEpic = async (
  projectId: Types.ObjectId,
  value: unknown,
): Promise<Types.ObjectId | undefined> => {
  if (!value) return undefined;
  const epic = await Task.findOne(
    { _id: toObjectId(value, "epic"), project: projectId },
    "_id type",
  ).lean();
  if (!epic || epic.type !== TaskTypeEnum.EPIC) {
    throw new ApiError(400, "Epic not found in this project");
  }
  return epic._id;
};

/** The workflow and key of a task's project */
const loadWorkflowProject = async (projectId: Types.ObjectId) => {
  const project = await Project.findById(projectId, "key statuses").lean();
  if (!project) {
    throw new ApiError(404, "Project not found");
  }
  return project;
};

type WorkflowProject = { statuses?: IProjectStatus[] | null };

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
  "key",
] as const;

/**
 * Builds the task filter shared by the board, list and backlog:
 * ?status=<key>&category=todo|in_progress|done&type=task|story|bug|epic|work
 *   &epic=<id>|none&assignee=me|unassigned|<userId>&priority&label
 *   &due=overdue|week|none&sprint=backlog|active|<id>&search
 * `type=work` means everything except epics (what boards and sprints show).
 */
const buildTaskFilter = async (
  query: Record<string, unknown>,
  projectId: Types.ObjectId,
  currentUser: AuthenticatedUser,
  search: string,
) => {
  const today = startOfTodayUtc();
  const filter: Record<string, unknown> = { project: projectId };

  if (typeof query.status === "string" && query.status) {
    filter.status = query.status;
  }
  if (isStatusCategory(query.category)) {
    filter.statusCategory = query.category;
  }
  if (isTaskPriority(query.priority)) {
    filter.priority = query.priority;
  }
  if (isTaskType(query.type)) {
    filter.type = query.type;
  } else if (query.type === "work") {
    filter.type = { $ne: TaskTypeEnum.EPIC };
  }
  if (query.epic === "none") {
    filter.epic = { $exists: false };
  } else if (typeof query.epic === "string" && query.epic) {
    filter.epic = toObjectId(query.epic, "epic");
  }
  if (typeof query.label === "string" && query.label) {
    filter.labels = query.label.toLowerCase();
  }
  if (query.due === "overdue") {
    filter.dueDate = { $lt: today };
    filter.statusCategory = filter.statusCategory ?? {
      $ne: StatusCategoryEnum.DONE,
    };
  } else if (query.due === "week") {
    filter.dueDate = {
      $gte: today,
      $lt: new Date(today.getTime() + 7 * DAY_MS),
    };
  } else if (query.due === "none") {
    filter.dueDate = { $exists: false };
  }

  const sprintParam = query.sprint;
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

  const assignee = query.assignee;
  if (assignee === "me") {
    filter.assignedTo = currentUser._id;
  } else if (assignee === "unassigned") {
    filter.assignedTo = { $exists: false };
  } else if (typeof assignee === "string" && assignee) {
    filter.assignedTo = toObjectId(assignee, "assignee");
  }
  if (search) {
    filter.$or = [
      { key: search.toUpperCase() },
      { title: searchRegex(search) },
      { description: searchRegex(search) },
      { labels: searchRegex(search) },
    ];
  }
  return filter;
};

/**
 * GET /tasks/:projectId?<filters, see buildTaskFilter>
 *   &sort=createdAt|updatedAt|title|dueDate|priority|key&order&page&limit
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
  const filter = await buildTaskFilter(
    req.query,
    projectId,
    currentUser,
    query.search,
  );

  // Tasks without a due date always sort last
  const noDueDate =
    query.sortOrder === 1 ? new Date(8.64e15) : new Date(-8.64e15);
  const sortKey = {
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    title: "titleLower",
    dueDate: "dueSort",
    priority: "priorityRank",
    key: "number",
  }[query.sortField];
  const notDone = { $ne: ["$statusCategory", StatusCategoryEnum.DONE] };

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
        ...lookupEpic,
        ...lookupOpenBlockers,
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
            $sum: {
              $cond: [
                { $eq: ["$statusCategory", StatusCategoryEnum.TODO] },
                1,
                0,
              ],
            },
          },
          in_progress: {
            $sum: {
              $cond: [
                { $eq: ["$statusCategory", StatusCategoryEnum.IN_PROGRESS] },
                1,
                0,
              ],
            },
          },
          done: {
            $sum: {
              $cond: [
                { $eq: ["$statusCategory", StatusCategoryEnum.DONE] },
                1,
                0,
              ],
            },
          },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: [{ $ifNull: ["$dueDate", noDueDate] }, today] },
                    { $ne: [{ $type: "$dueDate" }, "missing"] },
                    notDone,
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
                  $and: [{ $eq: ["$assignedTo", currentUser._id] }, notDone],
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
  const { title, description, assignedTo, priority } = req.body;
  const projectId = toObjectId(req.params.projectId, "project id");
  const currentUser = requireUser(req);
  const files = getUploadedFiles(req);

  try {
    const project = await loadWorkflowProject(projectId);
    const status = resolveStatus(project, req.body.status);
    const type = isTaskType(req.body.type) ? req.body.type : TaskTypeEnum.TASK;
    const assignee = await resolveAssignee(projectId, assignedTo);
    const sprint = await resolveSprint(projectId, req.body.sprint);
    if (type === TaskTypeEnum.EPIC && sprint) {
      throw new ApiError(400, "Epics can't be added to a sprint");
    }
    const epic =
      type === TaskTypeEnum.EPIC
        ? undefined
        : await resolveEpic(projectId, req.body.epic);

    // Reserved last, so validation errors don't use up ticket numbers
    const { number, key } = await reserveTaskNumber(projectId);
    const task = await Task.create({
      number,
      key,
      type,
      title,
      description,
      project: projectId,
      assignedTo: assignee,
      status: status.key,
      statusCategory: status.category,
      priority,
      dueDate: parseDueDate(req.body.dueDate) ?? undefined,
      labels: parseLabels(req.body.labels) ?? [],
      storyPoints: parseStoryPoints(req.body.storyPoints) ?? undefined,
      sprint,
      epic,
      assignedBy: currentUser._id,
      attachments: files.map((file) => toAttachment(req, file)),
    });

    const history: ActivityEntry[] = [
      { type: TaskActivityTypeEnum.CREATED, to: task.status },
    ];
    // Sprint reports need to know the task was in the sprint from the start
    if (task.sprint) {
      history.push({
        type: TaskActivityTypeEnum.SPRINT_CHANGED,
        from: null,
        to: await sprintSnapshot(task.sprint),
        name: "created",
      });
    }
    if (task.epic) {
      history.push({
        type: TaskActivityTypeEnum.EPIC_CHANGED,
        from: null,
        to: await taskSnapshot(task.epic),
        name: "created",
      });
    }
    await logActivity(task, currentUser._id, history);
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
    ...lookupEpic,
    ...lookupOpenBlockers,
    {
      $lookup: {
        from: "subtasks",
        localField: "_id",
        foreignField: "task",
        as: "subtasks",
        pipeline: [{ $sort: { createdAt: 1 } }, ...lookupUser("createdBy")],
      },
    },
    // Progress of an epic's child issues
    {
      $lookup: {
        from: "tasks",
        localField: "_id",
        foreignField: "epic",
        as: "children",
        pipeline: [{ $project: { statusCategory: 1, storyPoints: 1 } }],
      },
    },
    {
      $addFields: {
        priority: { $ifNull: ["$priority", "medium"] },
        labels: { $ifNull: ["$labels", []] },
        childCount: { $size: "$children" },
        doneChildCount: {
          $size: {
            $filter: {
              input: "$children",
              cond: { $eq: ["$$this.statusCategory", StatusCategoryEnum.DONE] },
            },
          },
        },
      },
    },
    { $project: { "attachments.localPath": 0, children: 0 } },
  ] as PipelineStage[]);

  if (!task[0]) {
    throw new ApiError(404, "Task not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, task[0], "Task fetched successfully"));
});

/** GET /tasks/key/:taskKey — finds a task by its ticket key, e.g. SPST-12 */
const getTaskByKey = asyncHandler<{ taskKey: string }>(async (req, res) => {
  const currentUser = requireUser(req);
  const key = String(req.params.taskKey).trim().toUpperCase();
  if (!TASK_KEY_PATTERN.test(key)) {
    throw new ApiError(404, "Task not found");
  }
  const task = await Task.findOne({ key }, "_id key project").lean();
  const isMember =
    task &&
    (await ProjectMember.exists({
      project: task.project,
      user: currentUser._id,
    }));
  // Non-members get 404 so keys can't be probed
  if (!task || !isMember) {
    throw new ApiError(404, "Task not found");
  }
  return res.status(200).json(new ApiResponse(200, task, "Task found"));
});

interface TaskChanges {
  history: ActivityEntry[];
  newAssignee?: Types.ObjectId;
  /** The task stopped being an epic, so its children lose their epic */
  demotedEpic: boolean;
}

/**
 * Applies editable fields from `body` to a task and returns its history.
 * Shared by single and bulk updates; fields that are absent are untouched.
 */
const applyTaskChanges = async (
  task: TaskDocument,
  body: Record<string, unknown>,
  project: WorkflowProject,
): Promise<TaskChanges> => {
  const history: ActivityEntry[] = [];
  const changes: TaskChanges = { history, demotedEpic: false };
  const { title, description, priority } = body;

  if (typeof title === "string" && title !== task.title) {
    history.push({
      type: TaskActivityTypeEnum.TITLE_CHANGED,
      from: task.title,
      to: title,
    });
    task.title = title;
  }
  if (
    typeof description === "string" &&
    description !== (task.description ?? "")
  ) {
    history.push({ type: TaskActivityTypeEnum.DESCRIPTION_CHANGED });
    task.description = description;
  }
  if (body.status !== undefined && body.status !== task.status) {
    const status = resolveStatus(project, body.status);
    history.push({
      type: TaskActivityTypeEnum.STATUS_CHANGED,
      from: task.status,
      to: status.key,
    });
    task.status = status.key;
    task.statusCategory = status.category;
  }
  if (priority !== undefined && priority !== task.priority) {
    if (!isTaskPriority(priority)) {
      throw new ApiError(422, "Priority is invalid");
    }
    history.push({
      type: TaskActivityTypeEnum.PRIORITY_CHANGED,
      from: task.priority ?? "medium",
      to: priority,
    });
    task.priority = priority;
  }
  if ("assignedTo" in body) {
    const assignee = await resolveAssignee(task.project, body.assignedTo);
    if (String(assignee ?? "") !== String(task.assignedTo ?? "")) {
      history.push({
        type: TaskActivityTypeEnum.ASSIGNEE_CHANGED,
        from: await userSnapshot(task.assignedTo),
        to: await userSnapshot(assignee),
      });
      task.assignedTo = assignee;
      changes.newAssignee = assignee;
    }
  }

  if (body.type !== undefined && body.type !== task.type) {
    if (!isTaskType(body.type)) {
      throw new ApiError(422, "Issue type is invalid");
    }
    history.push({
      type: TaskActivityTypeEnum.TYPE_CHANGED,
      from: task.type ?? TaskTypeEnum.TASK,
      to: body.type,
    });
    changes.demotedEpic = task.type === TaskTypeEnum.EPIC;
    task.type = body.type;
  }

  if ("sprint" in body) {
    const sprint = await resolveSprint(task.project, body.sprint);
    if (String(sprint ?? "") !== String(task.sprint ?? "")) {
      history.push({
        type: TaskActivityTypeEnum.SPRINT_CHANGED,
        from: await sprintSnapshot(task.sprint),
        to: await sprintSnapshot(sprint),
      });
      task.sprint = sprint;
    }
  }

  // Epics sit above sprints and can't have an epic themselves
  const isEpic = task.type === TaskTypeEnum.EPIC;
  if (isEpic && task.sprint) {
    throw new ApiError(
      400,
      "Epics can't be in a sprint. Move the task to the backlog first.",
    );
  }
  if ("epic" in body || (isEpic && task.epic)) {
    if (isEpic && body.epic) {
      throw new ApiError(400, "An epic can't belong to another epic");
    }
    const epic = isEpic
      ? undefined
      : await resolveEpic(task.project, body.epic);
    if (epic?.equals(task._id)) {
      throw new ApiError(400, "A task can't be its own epic");
    }
    if (String(epic ?? "") !== String(task.epic ?? "")) {
      history.push({
        type: TaskActivityTypeEnum.EPIC_CHANGED,
        from: await taskSnapshot(task.epic),
        to: await taskSnapshot(epic),
      });
      task.epic = epic;
    }
  }

  const dueDate = parseDueDate(body.dueDate);
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

  const storyPoints = parseStoryPoints(body.storyPoints);
  if (storyPoints !== undefined && storyPoints !== (task.storyPoints ?? null)) {
    history.push({
      type: TaskActivityTypeEnum.POINTS_CHANGED,
      from: task.storyPoints ?? null,
      to: storyPoints,
    });
    task.storyPoints = storyPoints ?? undefined;
  }

  const labels = parseLabels(body.labels);
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

  return changes;
};

/** A task that is no longer an epic releases its child issues */
const releaseEpicChildren = async (
  epic: {
    _id: Types.ObjectId;
    key: string;
    title: string;
    project: Types.ObjectId;
  },
  actor: Types.ObjectId,
) => {
  const children = await Task.find({ epic: epic._id }, "_id").lean();
  if (children.length === 0) return;
  await Task.updateMany(
    { _id: { $in: children.map((child) => child._id) } },
    { $unset: { epic: 1 } },
  );
  await logActivities(
    epic.project,
    actor,
    children.map((child) => ({
      task: child._id,
      type: TaskActivityTypeEnum.EPIC_CHANGED,
      from: { _id: epic._id, key: epic.key, name: epic.title },
      to: null,
    })),
  );
};

/** Saves applied changes and records their history and notifications */
const saveTaskChanges = async (
  task: TaskDocument,
  changes: TaskChanges,
  actor: AuthenticatedUser,
) => {
  await task.save();
  await logActivity(task, actor._id, changes.history);
  await notifyAssignee(actor, task, changes.newAssignee);
  if (changes.demotedEpic) await releaseEpicChildren(task, actor._id);
};

const updateTask = asyncHandler<TaskParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const files = getUploadedFiles(req);

  try {
    const task = await findTaskInProject(
      req.params.projectId,
      req.params.taskId,
    );
    const project = await loadWorkflowProject(task.project);
    const changes = await applyTaskChanges(task, req.body, project);

    if (files.length > 0) {
      if (task.attachments.length + files.length > MAX_ATTACHMENTS_PER_TASK) {
        throw new ApiError(
          400,
          `A task can have at most ${MAX_ATTACHMENTS_PER_TASK} attachments`,
        );
      }
      task.attachments.push(...files.map((file) => toAttachment(req, file)));
      changes.history.push({
        type: TaskActivityTypeEnum.ATTACHMENT_ADDED,
        name: files.map((file) => file.originalname).join(", "),
        to: files.length,
      });
    }

    await saveTaskChanges(task, changes, currentUser);

    return res
      .status(200)
      .json(new ApiResponse(200, task, "Task updated successfully"));
  } catch (error) {
    await removeFiles(files.map((file) => file.path));
    throw error;
  }
});

/**
 * Deletes a task with its subtasks, comments, links and files. Report history
 * is kept so sprint reports still count the task.
 */
const removeTask = async (task: TaskDocument, actor: Types.ObjectId) => {
  await logActivity(task, actor, [
    {
      type: TaskActivityTypeEnum.DELETED,
      name: task.title,
      from: {
        title: task.title,
        key: task.key,
        status: task.status,
        storyPoints: task.storyPoints ?? null,
        sprint: await sprintSnapshot(task.sprint),
      },
    },
  ]);

  if (task.type === TaskTypeEnum.EPIC) {
    await releaseEpicChildren(task, actor);
  }
  await Promise.all([
    task.deleteOne(),
    Subtask.deleteMany({ task: task._id }),
    TaskComment.deleteMany({ task: task._id }),
    TaskLink.deleteMany({ $or: [{ source: task._id }, { target: task._id }] }),
    TaskActivity.deleteMany({
      task: task._id,
      type: { $nin: REPORT_ACTIVITY_TYPES },
    }),
  ]);
  await removeFiles(task.attachments.map((file) => file.localPath));
};

const deleteTask = asyncHandler<TaskParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const task = await findTaskInProject(req.params.projectId, req.params.taskId);
  await removeTask(task, currentUser._id);

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

// ---------- Links ----------

/** A task in the same project, by id or ticket key */
const findLinkTarget = async (projectId: Types.ObjectId, value: string) => {
  const text = value.trim();
  const byId = /^[a-f\d]{24}$/i.test(text);
  const task = await Task.findOne(
    {
      project: projectId,
      ...(byId
        ? { _id: new mongoose.Types.ObjectId(text) }
        : { key: text.toUpperCase() }),
    },
    "_id key title",
  ).lean();
  if (!task) {
    throw new ApiError(404, `No task ${byId ? "" : `${text} `}in this project`);
  }
  return task;
};

/** Links of one task, each with the task on the other end */
const linksOf = (taskId: Types.ObjectId, match: Record<string, unknown> = {}) =>
  TaskLink.aggregate([
    { $match: { $or: [{ source: taskId }, { target: taskId }], ...match } },
    {
      $addFields: {
        direction: {
          $cond: [{ $eq: ["$source", taskId] }, "outward", "inward"],
        },
        other: { $cond: [{ $eq: ["$source", taskId] }, "$target", "$source"] },
      },
    },
    {
      $lookup: {
        from: "tasks",
        localField: "other",
        foreignField: "_id",
        as: "task",
        pipeline: [
          {
            $project: {
              _id: 1,
              key: 1,
              title: 1,
              type: 1,
              status: 1,
              statusCategory: 1,
              priority: { $ifNull: ["$priority", "medium"] },
            },
          },
        ],
      },
    },
    { $unwind: "$task" },
    { $sort: { type: 1, createdAt: 1 } },
    { $project: { _id: 1, type: 1, direction: 1, task: 1, createdAt: 1 } },
  ]);

/** GET /tasks/:projectId/t/:taskId/links */
const getTaskLinks = asyncHandler<TaskParams>(async (req, res) => {
  const task = await findTaskInProject(req.params.projectId, req.params.taskId);
  return res
    .status(200)
    .json(new ApiResponse(200, await linksOf(task._id), "Links fetched"));
});

/**
 * POST /tasks/:projectId/t/:taskId/links { type, target: id | key, direction? }
 * `direction: "inward"` reads the other way round ("this task is blocked by
 * target"), so both sides of a relation can be created from either task.
 */
const addTaskLink = asyncHandler<TaskParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const current = await findTaskInProject(
    req.params.projectId,
    req.params.taskId,
  );
  const inward = req.body.direction === "inward";
  const type = req.body.type as TaskLinkType;
  if (!AvailableTaskLinkTypes.includes(type)) {
    throw new ApiError(422, "Link type is invalid");
  }
  const other = await findLinkTarget(current.project, String(req.body.target));
  if (other._id.equals(current._id)) {
    throw new ApiError(400, "A task can't be linked to itself");
  }
  const currentSnapshot = {
    _id: current._id,
    key: current.key,
    title: current.title,
  };
  const [task, target] = inward
    ? [other, currentSnapshot]
    : [currentSnapshot, other];

  const alreadyLinked = await TaskLink.exists({
    type,
    $or: [
      { source: task._id, target: target._id },
      { source: target._id, target: task._id },
    ],
  });
  if (alreadyLinked) {
    throw new ApiError(409, `This task is already linked to ${other.key}`);
  }

  const link = await TaskLink.create({
    project: current.project,
    source: task._id,
    target: target._id,
    type,
    createdBy: currentUser._id,
  });
  await logActivities(current.project, currentUser._id, [
    {
      task: task._id,
      type: TaskActivityTypeEnum.LINK_ADDED,
      name: type,
      to: { _id: target._id, key: target.key, name: target.title },
    },
    {
      task: target._id,
      type: TaskActivityTypeEnum.LINK_ADDED,
      name: `${type}:inward`,
      to: { _id: task._id, key: task.key, name: task.title },
    },
  ]);

  const [created] = await linksOf(current._id, { _id: link._id });
  return res.status(201).json(new ApiResponse(201, created, "Link added"));
});

/** DELETE /tasks/:projectId/links/:linkId */
const deleteTaskLink = asyncHandler<LinkParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const link = await TaskLink.findOne({
    _id: toObjectId(req.params.linkId, "link id"),
    project: toObjectId(req.params.projectId, "project id"),
  });
  if (!link) {
    throw new ApiError(404, "Link not found");
  }
  await link.deleteOne();

  const [source, target] = await Promise.all([
    taskSnapshot(link.source),
    taskSnapshot(link.target),
  ]);
  await logActivities(link.project, currentUser._id, [
    {
      task: link.source,
      type: TaskActivityTypeEnum.LINK_REMOVED,
      name: link.type,
      to: target,
    },
    {
      task: link.target,
      type: TaskActivityTypeEnum.LINK_REMOVED,
      name: `${link.type}:inward`,
      to: source,
    },
  ]);

  return res.status(200).json(new ApiResponse(200, {}, "Link removed"));
});

// ---------- Bulk ----------

const BULK_FIELDS = [
  "status",
  "priority",
  "assignedTo",
  "sprint",
  "type",
  "epic",
  "storyPoints",
  "dueDate",
] as const;

/**
 * POST /tasks/:projectId/bulk
 * { taskIds, action: "update", changes: { status?, priority?, assignedTo?,
 *   sprint?, type?, epic?, storyPoints?, dueDate?, addLabels?, removeLabels? } }
 * { taskIds, action: "delete" }
 * Each task is updated on its own, so one invalid task doesn't block the rest;
 * those are returned in `failed`.
 */
const bulkUpdateTasks = asyncHandler<ProjectParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const projectId = toObjectId(req.params.projectId, "project id");
  const ids = [...new Set((req.body.taskIds as string[]).map(String))];
  const tasks = await Task.find({
    _id: { $in: ids.map((id) => toObjectId(id, "task id")) },
    project: projectId,
  });

  const failed: { taskId: string; key?: string; message: string }[] = ids
    .filter((id) => !tasks.some((task) => String(task._id) === id))
    .map((taskId) => ({ taskId, message: "Task not found" }));

  if (req.body.action === "delete") {
    for (const task of tasks) {
      await removeTask(task, currentUser._id);
    }
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { updated: tasks.length, failed },
          `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} deleted`,
        ),
      );
  }

  const input = (req.body.changes ?? {}) as Record<string, unknown>;
  const changes = Object.fromEntries(
    BULK_FIELDS.filter((field) => field in input).map((field) => [
      field,
      input[field],
    ]),
  );
  const addLabels = parseLabels(input.addLabels) ?? [];
  const removeLabels = parseLabels(input.removeLabels) ?? [];
  if (
    Object.keys(changes).length === 0 &&
    addLabels.length === 0 &&
    removeLabels.length === 0
  ) {
    throw new ApiError(422, "Choose at least one change");
  }

  const project = await loadWorkflowProject(projectId);
  let updated = 0;
  for (const task of tasks) {
    try {
      const body: Record<string, unknown> = { ...changes };
      if (addLabels.length || removeLabels.length) {
        body.labels = [
          ...new Set([...(task.labels ?? []), ...addLabels]),
        ].filter((label) => !removeLabels.includes(label));
      }
      const result = await applyTaskChanges(task, body, project);
      if (result.history.length === 0) continue;
      await saveTaskChanges(task, result, currentUser);
      updated += 1;
    } catch (error) {
      failed.push({
        taskId: String(task._id),
        key: task.key,
        message:
          error instanceof ApiError
            ? error.message
            : "Couldn't update the task",
      });
    }
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { updated, failed },
        `${updated} ${updated === 1 ? "task" : "tasks"} updated`,
      ),
    );
});

// ---------- Saved filters ----------

const FILTER_KEYS = [
  "status",
  "category",
  "assignee",
  "priority",
  "label",
  "due",
  "type",
  "epic",
  "sprint",
  "search",
  "sort",
  "order",
] as const;

const cleanFilters = (value: unknown) => {
  const input = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    FILTER_KEYS.filter(
      (key) => typeof input[key] === "string" && input[key],
    ).map((key) => [key, String(input[key]).slice(0, 100)]),
  );
};

/** GET /tasks/:projectId/filters — the current user's saved filters */
const getSavedFilters = asyncHandler<ProjectParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const filters = await SavedFilter.find(
    {
      user: currentUser._id,
      project: toObjectId(req.params.projectId, "project id"),
    },
    "_id name filters createdAt",
  )
    .sort({ name: 1 })
    .lean();
  return res
    .status(200)
    .json(new ApiResponse(200, filters, "Saved filters fetched"));
});

/** POST /tasks/:projectId/filters { name, filters } — saving a name again replaces it */
const saveFilter = asyncHandler<ProjectParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const projectId = toObjectId(req.params.projectId, "project id");
  const name = String(req.body.name).trim();
  const owner = { user: currentUser._id, project: projectId };

  const exists = await SavedFilter.exists({ ...owner, name });
  if (
    !exists &&
    (await SavedFilter.countDocuments(owner)) >= MAX_SAVED_FILTERS
  ) {
    throw new ApiError(
      400,
      `You can save up to ${MAX_SAVED_FILTERS} filters per project`,
    );
  }

  const filter = await SavedFilter.findOneAndUpdate(
    { ...owner, name },
    { $set: { filters: cleanFilters(req.body.filters) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return res
    .status(exists ? 200 : 201)
    .json(new ApiResponse(exists ? 200 : 201, filter, "Filter saved"));
});

const deleteSavedFilter = asyncHandler<FilterParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const filter = await SavedFilter.findOneAndDelete({
    _id: toObjectId(req.params.filterId, "filter id"),
    user: currentUser._id,
    project: toObjectId(req.params.projectId, "project id"),
  });
  if (!filter) {
    throw new ApiError(404, "Filter not found");
  }
  return res.status(200).json(new ApiResponse(200, {}, "Filter deleted"));
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
    filter.statusCategory = StatusCategoryEnum.DONE;
  } else if (req.query.status !== "all") {
    filter.statusCategory = { $ne: StatusCategoryEnum.DONE };
  }
  if (isTaskPriority(req.query.priority)) {
    filter.priority = req.query.priority;
  }
  if (query.search) {
    filter.$or = [
      { key: query.search.toUpperCase() },
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
  const notDone = { $ne: ["$statusCategory", StatusCategoryEnum.DONE] };
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
            // Statuses are per project, so badges need each project's workflow
            pipeline: [{ $project: { _id: 1, name: 1, key: 1, statuses: 1 } }],
          },
        },
        { $unwind: "$project" },
        ...lookupEpic,
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
  addTaskLink,
  bulkUpdateTasks,
  deleteSavedFilter,
  deleteTaskLink,
  getSavedFilters,
  getTaskByKey,
  getTaskLinks,
  saveFilter,
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
