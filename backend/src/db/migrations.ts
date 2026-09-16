import mongoose from "mongoose";
import { ProjectNote } from "../models/note.models.js";
import { Task } from "../models/task.models.js";
import { Project } from "../models/project.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import { UserRolesEnum, type UserRole } from "../utils/constants.js";
import { plainTextToRichText } from "../utils/rich-text.js";

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

export const runMigrations = async () => {
  await dropGlobalProjectNameIndex();
  await removeDuplicateMemberships();
  await convertPlainTextNotes();
  await backfillTaskFields();

  const results = await Promise.allSettled(
    Object.values(mongoose.models).map((model) => model.createIndexes()),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("❌ Failed to build an index:", result.reason);
    }
  }
};
