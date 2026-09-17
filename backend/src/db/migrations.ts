import mongoose from "mongoose";
import { ProjectNote } from "../models/note.models.js";
import { Task } from "../models/task.models.js";
import { DEFAULT_STATUSES, Project } from "../models/project.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import { UserRolesEnum, type UserRole } from "../utils/constants.js";
import { plainTextToRichText } from "../utils/rich-text.js";
import { suggestProjectKey, uniqueProjectKey } from "../utils/workflow.js";

const rolePriority: Record<UserRole, number> = {
  [UserRolesEnum.ADMIN]: 0,
  [UserRolesEnum.PROJECT_ADMIN]: 1,
  [UserRolesEnum.MEMBER]: 2,
};

/** Project names used to be globally unique; they are now unique per owner */
const dropGlobalProjectNameIndex = async () => {
  const indexes = await Project.collection.indexes().catch(() => []);
  if (indexes.some((index) => index.name === "name_1")) {
    await Project.collection.dropIndex("name_1");
    console.log("🛠  Dropped legacy unique index projects.name_1");
  }
};

/**
 * Before (project, user) became a unique index, duplicates were possible.
 * Keep the most privileged membership of each pair and delete the rest.
 */
const removeDuplicateMemberships = async () => {
  const duplicates = await ProjectMember.aggregate<{
    memberships: { _id: mongoose.Types.ObjectId; role: UserRole }[];
  }>([
    {
      $group: {
        _id: { project: "$project", user: "$user" },
        memberships: { $push: { _id: "$_id", role: "$role" } },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  const idsToDelete = duplicates.flatMap(({ memberships }) =>
    memberships
      .toSorted((a, b) => rolePriority[a.role] - rolePriority[b.role])
      .slice(1)
      .map((membership) => membership._id),
  );

  if (idsToDelete.length > 0) {
    await ProjectMember.deleteMany({ _id: { $in: idsToDelete } });
    console.log(
      `🛠  Removed ${idsToDelete.length} duplicate project memberships`,
    );
  }
};

/**
 * Runs idempotent data fixes, then builds the indexes declared on every model.
 * Automatic index builds are disabled (see db/index.ts) so they can't race
 * these fixes and fail on existing duplicates.
 */
/**
 * Notes used to be plain text. Convert them to rich text HTML (one paragraph
 * per line) and store the plain text copy used for search.
 */
const convertPlainTextNotes = async () => {
  const legacy = await ProjectNote.find(
    { contentText: { $exists: false } },
    "_id content",
  ).lean();
  if (legacy.length === 0) return;

  await ProjectNote.bulkWrite(
    legacy.map((note) => ({
      updateOne: {
        filter: { _id: note._id },
        update: {
          $set: {
            content: plainTextToRichText(note.content),
            contentText: note.content,
          },
        },
      },
    })),
  );
  console.log(`🛠  Converted ${legacy.length} plain-text notes to rich text`);
};

/** Tasks created before priority/labels existed get their defaults */
const backfillTaskFields = async () => {
  const [priority, labels] = await Promise.all([
    Task.updateMany(
      { priority: { $exists: false } },
      { $set: { priority: "medium" } },
    ),
    Task.updateMany({ labels: { $exists: false } }, { $set: { labels: [] } }),
  ]);
  const count = Math.max(priority.modifiedCount, labels.modifiedCount);
  if (count > 0) {
    console.log(`🛠  Added priority/labels defaults to ${count} tasks`);
  }
};

/** Projects created before custom workflows get the default statuses */
const backfillProjectWorkflows = async () => {
  const result = await Project.updateMany(
    { $or: [{ statuses: { $exists: false } }, { statuses: { $size: 0 } }] },
    { $set: { statuses: DEFAULT_STATUSES } },
  );
  if (result.modifiedCount > 0) {
    console.log(
      `🛠  Added the default workflow to ${result.modifiedCount} projects`,
    );
  }

  // Legacy statuses were the categories themselves
  const tasks = await Task.updateMany({ statusCategory: { $exists: false } }, [
    { $set: { statusCategory: "$status" } },
  ]);
  const types = await Task.updateMany(
    { type: { $exists: false } },
    { $set: { type: "task" } },
  );
  const count = Math.max(tasks.modifiedCount, types.modifiedCount);
  if (count > 0) {
    console.log(`🛠  Added status categories / types to ${count} tasks`);
  }
};

/**
 * Gives every project a ticket key and numbers its existing tasks in the
 * order they were created (SPST-1, SPST-2, …).
 */
const backfillTicketKeys = async () => {
  const projects = await Project.find(
    { $or: [{ key: { $exists: false } }, { key: null }, { key: "" }] },
    "_id name",
  ).lean();
  for (const project of projects) {
    const key = await uniqueProjectKey(suggestProjectKey(project.name));
    await Project.updateOne({ _id: project._id }, { $set: { key } });
  }
  if (projects.length > 0) {
    console.log(`🛠  Assigned ticket keys to ${projects.length} projects`);
  }

  const unnumbered = await Task.distinct("project", {
    number: { $exists: false },
  });
  let numbered = 0;
  for (const projectId of unnumbered) {
    const project = await Project.findById(projectId, "key taskCounter").lean();
    if (!project) continue;
    const tasks = await Task.find(
      { project: projectId, number: { $exists: false } },
      "_id",
    )
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    let counter = project.taskCounter ?? 0;
    await Task.bulkWrite(
      tasks.map((task) => {
        counter += 1;
        return {
          updateOne: {
            filter: { _id: task._id },
            update: {
              $set: { number: counter, key: `${project.key}-${counter}` },
            },
          },
        };
      }),
    );
    await Project.updateOne(
      { _id: projectId },
      { $set: { taskCounter: counter } },
    );
    numbered += tasks.length;
  }
  if (numbered > 0) {
    console.log(`🛠  Numbered ${numbered} existing tasks`);
  }
};

export const runMigrations = async () => {
  await dropGlobalProjectNameIndex();
  await removeDuplicateMemberships();
  await convertPlainTextNotes();
  await backfillTaskFields();
  await backfillProjectWorkflows();
  await backfillTicketKeys();

  const results = await Promise.allSettled(
    Object.values(mongoose.models).map((model) => model.createIndexes()),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("❌ Failed to build an index:", result.reason);
    }
  }
};
