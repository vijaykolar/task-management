import mongoose, { type PipelineStage } from "mongoose";
import { ProjectNote } from "../models/note.models.js";
import { Project, type IProjectStatus } from "../models/project.models.js";
import {
  INVITE_TTL_DAYS,
  InviteStatusEnum,
  ProjectInvite,
  inviteExpiryDate,
} from "../models/projectinvite.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import { Subtask } from "../models/subtask.models.js";
import { Task } from "../models/task.models.js";
import { TaskComment } from "../models/taskcomment.models.js";
import { TaskActivity } from "../models/taskactivity.models.js";
import { Notification } from "../models/notification.models.js";
import { SavedFilter } from "../models/savedfilter.models.js";
import { Sprint } from "../models/sprint.models.js";
import { TaskActivityTypeEnum } from "../models/taskactivity.models.js";
import { TaskLink } from "../models/tasklink.models.js";
import { User } from "../models/user.models.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { logActivities } from "../utils/activity.js";
import { removeFiles } from "../utils/attachments.js";
import {
  AvailableStatusCategories,
  MAX_PROJECT_STATUSES,
  StatusCategoryEnum,
  UserRolesEnum,
  isUserRole,
  type StatusCategory,
  type UserRole,
} from "../utils/constants.js";
import {
  projectAddedMailgenContent,
  projectInviteMailgenContent,
  sendEmail,
} from "../utils/mail.js";
import { toObjectId } from "../utils/object-id.js";
import {
  facetPage,
  fromFacet,
  parseListQuery,
  searchRegex,
} from "../utils/pagination.js";
import { requireUser } from "../utils/request-user.js";
import { frontendUrl } from "../utils/urls.js";
import {
  PROJECT_KEY_PATTERN,
  newStatusKey,
  projectStatuses,
  suggestProjectKey,
  uniqueProjectKey,
} from "../utils/workflow.js";

type ProjectParams = { projectId: string };
type MemberParams = ProjectParams & { userId: string };
type InviteParams = ProjectParams & { inviteId: string };

const OWNER_MUST_STAY_ADMIN =
  "The project owner must remain an admin. Transfer ownership first.";

const USER_SUMMARY = { _id: 1, username: 1, fullName: 1, avatar: 1 } as const;

const findProjectOr404 = async (projectId: string) => {
  const project = await Project.findById(toObjectId(projectId, "project id"));
  if (!project) {
    throw new ApiError(404, "Project not found");
  }
  return project;
};

const displayName = (user: { fullName?: string; username: string }) =>
  user.fullName?.trim() || user.username;

// ---------- Projects ----------

const PROJECT_SORT_FIELDS = ["createdAt", "name", "members"] as const;

/**
 * GET /projects?page&limit&sort=createdAt|name|members&order&search&role
 * Returns one page of the user's projects plus overall stats.
 */
const getProjects = asyncHandler(async (req, res) => {
  const currentUser = requireUser(req);
  const userId = new mongoose.Types.ObjectId(currentUser._id);
  const query = parseListQuery(req.query, {
    sortFields: PROJECT_SORT_FIELDS,
    defaultSort: "createdAt",
    defaultLimit: 12,
    maxLimit: 50,
  });
  const role = isUserRole(req.query.role) ? req.query.role : undefined;

  const withProject: PipelineStage[] = [
    {
      $lookup: {
        from: "projects",
        localField: "project",
        foreignField: "_id",
        as: "project",
        pipeline: [
          {
            $lookup: {
              from: "projectmembers",
              localField: "_id",
              foreignField: "project",
              as: "memberships",
              pipeline: [{ $project: { _id: 1 } }],
            },
          },
          { $addFields: { members: { $size: "$memberships" } } },
          { $project: { memberships: 0 } },
        ],
      },
    },
    { $unwind: "$project" },
  ];

  const sortKey =
    query.sortField === "name"
      ? "project.nameLower"
      : `project.${query.sortField}`;

  const [page, stats] = await Promise.all([
    ProjectMember.aggregate([
      { $match: { user: userId, ...(role && { role }) } },
      ...withProject,
      ...(query.search
        ? [{ $match: { "project.name": searchRegex(query.search) } }]
        : []),
      { $addFields: { "project.nameLower": { $toLower: "$project.name" } } },
      { $sort: { [sortKey]: query.sortOrder, "project._id": 1 } },
      facetPage(query, [
        {
          $project: {
            _id: 0,
            role: 1,
            isOwner: { $eq: ["$project.createdBy", userId] },
            project: {
              _id: 1,
              name: 1,
              key: 1,
              description: 1,
              members: 1,
              createdAt: 1,
              updatedAt: 1,
              createdBy: 1,
            },
          },
        },
      ]),
    ]),
    ProjectMember.aggregate([
      { $match: { user: userId } },
      ...withProject,
      {
        $group: {
          _id: null,
          totalProjects: { $sum: 1 },
          adminProjects: {
            $sum: { $cond: [{ $eq: ["$role", UserRolesEnum.ADMIN] }, 1, 0] },
          },
          totalSeats: { $sum: "$project.members" },
        },
      },
    ]),
  ]);

  const {
    totalProjects = 0,
    adminProjects = 0,
    totalSeats = 0,
  } = stats[0] ?? {};

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...fromFacet(page, query),
        stats: { totalProjects, adminProjects, totalSeats },
      },
      "Projects fetched successfully",
    ),
  );
});

/** Includes the caller's role and ownership so the UI needs no extra lookups */
const getProjectById = asyncHandler<ProjectParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const project = await findProjectOr404(req.params.projectId);
  const [members, hasTasks] = await Promise.all([
    ProjectMember.countDocuments({ project: project._id }),
    Task.exists({ project: project._id }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...project.toJSON(),
        statuses: projectStatuses(project),
        // The ticket key can only change while no ticket uses it
        keyLocked: !!hasTasks,
        members,
        role: currentUser.role,
        isOwner: project.createdBy.equals(currentUser._id),
      },
      "Project fetched successfully",
    ),
  );
});

/** Normalizes a requested ticket key; empty = generate one from the name */
const requestedKey = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.trim().toUpperCase()
    : undefined;

const assertKeyAvailable = async (key: string, projectId?: unknown) => {
  if (!PROJECT_KEY_PATTERN.test(key)) {
    throw new ApiError(
      422,
      "Key must be 2-10 letters or digits and start with a letter",
    );
  }
  const taken = await Project.exists({
    key,
    ...(projectId ? { _id: { $ne: projectId } } : {}),
  });
  if (taken) {
    throw new ApiError(
      409,
      `The key ${key} is already used by another project`,
    );
  }
};

const createProject = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const currentUser = requireUser(req);

  let key = requestedKey(req.body.key);
  if (key) await assertKeyAvailable(key);
  else key = await uniqueProjectKey(suggestProjectKey(String(name)));

  const project = await Project.create({
    name,
    description,
    key,
    createdBy: currentUser._id,
  });

  await ProjectMember.create({
    user: currentUser._id,
    project: project._id,
    role: UserRolesEnum.ADMIN,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, project, "Project created Successfully"));
});

const updateProject = asyncHandler<ProjectParams>(async (req, res) => {
  const { name, description } = req.body;
  const project = await findProjectOr404(req.params.projectId);

  const key = requestedKey(req.body.key);
  if (key && key !== project.key) {
    if (await Task.exists({ project: project._id })) {
      throw new ApiError(
        409,
        "The key can't change once the project has tasks, because existing ticket keys would break",
      );
    }
    await assertKeyAvailable(key, project._id);
    project.key = key;
  }
  project.name = name;
  project.description = description;
  await project.save();

  return res
    .status(200)
    .json(new ApiResponse(200, project, "Project updated successfully"));
});

const deleteProject = asyncHandler<ProjectParams>(async (req, res) => {
  const projectOid = toObjectId(req.params.projectId, "project id");

  const project = await Project.findByIdAndDelete(projectOid);
  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  // Cascade: members, invites, notes, tasks, their subtasks and uploaded files
  const tasks = await Task.find({ project: projectOid }, "_id attachments");
  await Promise.all([
    ProjectMember.deleteMany({ project: projectOid }),
    ProjectInvite.deleteMany({ project: projectOid }),
    ProjectNote.deleteMany({ project: projectOid }),
    TaskComment.deleteMany({ project: projectOid }),
    TaskActivity.deleteMany({ project: projectOid }),
    Notification.deleteMany({ project: projectOid }),
    Sprint.deleteMany({ project: projectOid }),
    TaskLink.deleteMany({ project: projectOid }),
    SavedFilter.deleteMany({ project: projectOid }),
    Subtask.deleteMany({ task: { $in: tasks.map((task) => task._id) } }),
    Task.deleteMany({ project: projectOid }),
  ]);
  await removeFiles(
    tasks.flatMap((task) => task.attachments.map((file) => file.localPath)),
  );

  return res
    .status(200)
    .json(new ApiResponse(200, project, "Project deleted successfully"));
});

/** Any member except the owner may leave */
const leaveProject = asyncHandler<ProjectParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const project = await findProjectOr404(req.params.projectId);

  if (project.createdBy.equals(currentUser._id)) {
    throw new ApiError(
      400,
      "Owners can't leave their project. Transfer ownership first, or delete the project.",
    );
  }

  await ProjectMember.deleteOne({
    project: project._id,
    user: currentUser._id,
  });
  await Task.updateMany(
    { project: project._id, assignedTo: currentUser._id },
    { $unset: { assignedTo: 1 } },
  );

  return res
    .status(200)
    .json(new ApiResponse(200, {}, `You left "${project.name}"`));
});

/** Owner only: hands the project to another member, who becomes an admin */
const transferOwnership = asyncHandler<ProjectParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const project = await findProjectOr404(req.params.projectId);
  const newOwnerId = toObjectId(req.body.userId, "user id");

  if (!project.createdBy.equals(currentUser._id)) {
    throw new ApiError(403, "Only the project owner can transfer ownership");
  }
  if (newOwnerId.equals(currentUser._id)) {
    throw new ApiError(400, "You already own this project");
  }

  const membership = await ProjectMember.findOne({
    project: project._id,
    user: newOwnerId,
  });
  if (!membership) {
    throw new ApiError(400, "The new owner must be a member of the project");
  }

  // Project names are unique per owner
  const nameTaken = await Project.exists({
    _id: { $ne: project._id },
    createdBy: newOwnerId,
    name: project.name,
  });
  if (nameTaken) {
    throw new ApiError(
      409,
      "The new owner already owns a project with this name. Rename this project first.",
    );
  }

  membership.role = UserRolesEnum.ADMIN;
  await membership.save();
  project.createdBy = newOwnerId;
  await project.save();

  return res
    .status(200)
    .json(new ApiResponse(200, project, "Ownership transferred"));
});

// ---------- Members ----------

const MEMBER_SORT_FIELDS = ["joined", "name", "role"] as const;

/** GET /projects/:id/members?page&limit&sort=joined|name|role&order&search */
const getProjectMembers = asyncHandler<ProjectParams>(async (req, res) => {
  const project = await findProjectOr404(req.params.projectId);
  const query = parseListQuery(req.query, {
    sortFields: MEMBER_SORT_FIELDS,
    defaultSort: "joined",
    defaultOrder: "asc",
    defaultLimit: 20,
  });

  const sortKey = {
    joined: "createdAt",
    name: "nameLower",
    role: "roleRank",
  }[query.sortField];

  const result = await ProjectMember.aggregate([
    { $match: { project: project._id } },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
        pipeline: [{ $project: USER_SUMMARY }],
      },
    },
    { $unwind: "$user" },
    ...(query.search
      ? [
          {
            $match: {
              $or: [
                { "user.username": searchRegex(query.search) },
                { "user.fullName": searchRegex(query.search) },
              ],
            },
          },
        ]
      : []),
    {
      $addFields: {
        nameLower: {
          $toLower: { $ifNull: ["$user.fullName", "$user.username"] },
        },
        roleRank: {
          $indexOfArray: [
            [
              UserRolesEnum.ADMIN,
              UserRolesEnum.PROJECT_ADMIN,
              UserRolesEnum.MEMBER,
            ],
            "$role",
          ],
        },
      },
    },
    { $sort: { [sortKey]: query.sortOrder, _id: 1 } },
    facetPage(query, [
      {
        $project: {
          _id: 0,
          project: 1,
          user: 1,
          role: 1,
          createdAt: 1,
          updatedAt: 1,
          isOwner: { $eq: ["$user._id", project.createdBy] },
        },
      },
    ]),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(200, fromFacet(result, query), "Project members fetched"),
    );
});

/**
 * Adds an existing user (and notifies them), or invites an email that has no
 * account yet. Adding someone who is already a member updates their role.
 */
const addMembersToProject = asyncHandler<ProjectParams>(async (req, res) => {
  const inviter = requireUser(req);
  const project = await findProjectOr404(req.params.projectId);
  const email = String(req.body.email).trim().toLowerCase();
  const role = req.body.role as UserRole;

  const emailDetails = {
    projectName: project.name,
    inviterName: displayName(inviter),
    role,
  };

  const user = await User.findOne({ email });

  if (user) {
    const existing = await ProjectMember.findOne({
      project: project._id,
      user: user._id,
    });

    if (existing) {
      if (project.createdBy.equals(user._id) && role !== UserRolesEnum.ADMIN) {
        throw new ApiError(400, OWNER_MUST_STAY_ADMIN);
      }
      existing.role = role;
      await existing.save();
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { status: "updated" },
            "Already a member: role updated",
          ),
        );
    }

    await ProjectMember.create({ project: project._id, user: user._id, role });
    await ProjectInvite.deleteOne({ project: project._id, email });

    // Notification is best effort: the membership already exists
    sendEmail({
      email: user.email,
      subject: `You were added to "${project.name}"`,
      mailgenContent: projectAddedMailgenContent(user.username, {
        ...emailDetails,
        projectUrl: `${frontendUrl()}/projects/${project._id}`,
      }),
    }).catch((error) =>
      console.error("Failed to send project-added email:", error),
    );

    return res
      .status(201)
      .json(
        new ApiResponse(201, { status: "added" }, "Member added and notified"),
      );
  }

  const invite = await ProjectInvite.findOneAndUpdate(
    { project: project._id, email },
    {
      role,
      invitedBy: inviter._id,
      status: InviteStatusEnum.PENDING,
      expiresAt: inviteExpiryDate(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  try {
    await sendInviteEmail(email, emailDetails);
  } catch (error) {
    await ProjectInvite.deleteOne({ _id: invite._id });
    throw error;
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { status: "invited", invite },
        `Invitation sent to ${email}`,
      ),
    );
});

const sendInviteEmail = async (
  email: string,
  details: { projectName: string; inviterName: string; role: string },
) => {
  await sendEmail({
    email,
    subject: `${details.inviterName} invited you to "${details.projectName}"`,
    mailgenContent: projectInviteMailgenContent({
      ...details,
      projectUrl: `${frontendUrl()}/register?email=${encodeURIComponent(email)}`,
      expiresInDays: INVITE_TTL_DAYS,
    }),
  });
};

const updateMemberRole = asyncHandler<MemberParams>(async (req, res) => {
  const project = await findProjectOr404(req.params.projectId);
  const userId = toObjectId(req.params.userId, "user id");
  const { newRole } = req.body;

  if (!isUserRole(newRole)) {
    throw new ApiError(400, "Invalid role");
  }
  if (project.createdBy.equals(userId) && newRole !== UserRolesEnum.ADMIN) {
    throw new ApiError(400, OWNER_MUST_STAY_ADMIN);
  }

  const projectMember = await ProjectMember.findOneAndUpdate(
    { project: project._id, user: userId },
    { role: newRole },
    { new: true },
  );

  if (!projectMember) {
    throw new ApiError(404, "Project member not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        projectMember,
        "Project member role updated successfully",
      ),
    );
});

const deleteMember = asyncHandler<MemberParams>(async (req, res) => {
  const project = await findProjectOr404(req.params.projectId);
  const userId = toObjectId(req.params.userId, "user id");

  if (project.createdBy.equals(userId)) {
    throw new ApiError(
      400,
      "The project owner can't be removed. Transfer ownership first.",
    );
  }

  const projectMember = await ProjectMember.findOneAndDelete({
    project: project._id,
    user: userId,
  });

  if (!projectMember) {
    throw new ApiError(404, "Project member not found");
  }

  // A removed member can't keep tasks in this project
  await Task.updateMany(
    { project: project._id, assignedTo: userId },
    { $unset: { assignedTo: 1 } },
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        projectMember,
        "Project member deleted successfully",
      ),
    );
});

// ---------- Invitations ----------

const getProjectInvites = asyncHandler<ProjectParams>(async (req, res) => {
  const project = await findProjectOr404(req.params.projectId);

  const invites = await ProjectInvite.aggregate([
    { $match: { project: project._id, status: InviteStatusEnum.PENDING } },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: "users",
        localField: "invitedBy",
        foreignField: "_id",
        as: "invitedBy",
        pipeline: [{ $project: USER_SUMMARY }],
      },
    },
    { $addFields: { invitedBy: { $arrayElemAt: ["$invitedBy", 0] } } },
    { $addFields: { isExpired: { $lt: ["$expiresAt", "$$NOW"] } } },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, invites, "Invitations fetched"));
});

const findPendingInvite = async (projectId: string, inviteId: string) => {
  const invite = await ProjectInvite.findOne({
    _id: toObjectId(inviteId, "invitation id"),
    project: toObjectId(projectId, "project id"),
    status: InviteStatusEnum.PENDING,
  });
  if (!invite) {
    throw new ApiError(404, "Invitation not found");
  }
  return invite;
};

const resendInvite = asyncHandler<InviteParams>(async (req, res) => {
  const inviter = requireUser(req);
  const project = await findProjectOr404(req.params.projectId);
  const invite = await findPendingInvite(
    req.params.projectId,
    req.params.inviteId,
  );

  invite.expiresAt = inviteExpiryDate();
  invite.invitedBy = inviter._id;
  await invite.save();

  await sendInviteEmail(invite.email, {
    projectName: project.name,
    inviterName: displayName(inviter),
    role: invite.role,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, invite, `Invitation re-sent to ${invite.email}`),
    );
});

const revokeInvite = asyncHandler<InviteParams>(async (req, res) => {
  const invite = await findPendingInvite(
    req.params.projectId,
    req.params.inviteId,
  );
  await invite.deleteOne();

  return res.status(200).json(new ApiResponse(200, {}, "Invitation revoked"));
});

// ---------- Workflow ----------

interface StatusInput {
  key?: unknown;
  name?: unknown;
  category?: unknown;
}

/**
 * PUT /projects/:projectId/statuses
 * { statuses: [{ key?, name, category }], moves?: { removedKey: targetKey } }
 * Replaces the workflow (array order = board order). Statuses without a key
 * are new. Tasks in a removed status must be moved with `moves`; removed
 * statuses are archived so their names stay readable in history.
 */
const updateProjectStatuses = asyncHandler<ProjectParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const project = await findProjectOr404(req.params.projectId);
  const input: StatusInput[] = Array.isArray(req.body.statuses)
    ? req.body.statuses
    : [];
  const moves: Record<string, unknown> =
    req.body.moves && typeof req.body.moves === "object" ? req.body.moves : {};

  if (input.length === 0 || input.length > MAX_PROJECT_STATUSES) {
    throw new ApiError(
      422,
      `A workflow needs between 1 and ${MAX_PROJECT_STATUSES} statuses`,
    );
  }

  const current = projectStatuses(project);
  const currentByKey = new Map(current.map((status) => [status.key, status]));
  const takenKeys = new Set(current.map((status) => status.key));
  const seenNames = new Set<string>();

  const next: IProjectStatus[] = input.map((item) => {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name || name.length > 30) {
      throw new ApiError(422, "Status names must be 1–30 characters");
    }
    if (seenNames.has(name.toLowerCase())) {
      throw new ApiError(422, `There are two statuses named "${name}"`);
    }
    seenNames.add(name.toLowerCase());
    if (!AvailableStatusCategories.includes(item.category as StatusCategory)) {
      throw new ApiError(422, `Choose a category for "${name}"`);
    }
    const existing =
      typeof item.key === "string" ? currentByKey.get(item.key) : undefined;
    if (typeof item.key === "string" && !existing) {
      throw new ApiError(422, `Unknown status "${name}"`);
    }
    return {
      key: existing ? existing.key : newStatusKey(name, takenKeys),
      name,
      category: item.category as StatusCategory,
    };
  });

  const requiredCategories = [
    { category: StatusCategoryEnum.TODO, label: "To do" },
    { category: StatusCategoryEnum.DONE, label: "Done" },
  ];
  for (const { category, label } of requiredCategories) {
    if (!next.some((status) => status.category === category)) {
      throw new ApiError(
        422,
        `The workflow needs at least one status in the ${label} category`,
      );
    }
  }
  if (new Set(next.map((status) => status.key)).size !== next.length) {
    throw new ApiError(422, "A status appears twice");
  }

  const nextKeys = new Set(next.map((status) => status.key));
  const removed = current.filter(
    (status) => !status.archived && !nextKeys.has(status.key),
  );

  // Every task in a removed status needs somewhere to go
  const moveTargets = new Map<string, IProjectStatus>();
  for (const status of removed) {
    const count = await Task.countDocuments({
      project: project._id,
      status: status.key,
    });
    if (count === 0) continue;
    const target = next.find(
      (candidate) => candidate.key === moves[status.key],
    );
    if (!target) {
      throw new ApiError(
        409,
        `${count} ${count === 1 ? "task is" : "tasks are"} in "${status.name}". Choose where to move ${count === 1 ? "it" : "them"}.`,
      );
    }
    moveTargets.set(status.key, target);
  }

  // Archived statuses stay at the end so old history keeps its names
  const archived = current
    .filter((status) => !nextKeys.has(status.key))
    .map((status) => ({ ...status, archived: true }));
  project.statuses = [...next, ...archived];
  await project.save();

  for (const [fromKey, target] of moveTargets) {
    const tasks = await Task.find(
      { project: project._id, status: fromKey },
      "_id",
    ).lean();
    await Task.updateMany(
      { _id: { $in: tasks.map((task) => task._id) } },
      { $set: { status: target.key, statusCategory: target.category } },
    );
    await logActivities(
      project._id,
      currentUser._id,
      tasks.map((task) => ({
        task: task._id,
        type: TaskActivityTypeEnum.STATUS_CHANGED,
        from: fromKey,
        to: target.key,
        name: "status_removed",
      })),
    );
  }

  // Keep the copied category in sync when a status changes category
  for (const status of next) {
    const before = currentByKey.get(status.key);
    if (before && before.category !== status.category) {
      await Task.updateMany(
        { project: project._id, status: status.key },
        { $set: { statusCategory: status.category } },
      );
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, projectStatuses(project), "Workflow updated"));
});

export {
  updateProjectStatuses,
  addMembersToProject,
  createProject,
  deleteMember,
  deleteProject,
  getProjectById,
  getProjectInvites,
  getProjectMembers,
  getProjects,
  leaveProject,
  resendInvite,
  revokeInvite,
  transferOwnership,
  updateMemberRole,
  updateProject,
};
