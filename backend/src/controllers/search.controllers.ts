import { ProjectNote } from "../models/note.models.js";
import { Project } from "../models/project.models.js";
import { ProjectMember } from "../models/projectmember.models.js";
import { Task } from "../models/task.models.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { searchRegex } from "../utils/pagination.js";
import { requireUser } from "../utils/request-user.js";

const MIN_QUERY_LENGTH = 2;
const EXCERPT_RADIUS = 60;

const lookupProjectName = [
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
];

/** A short piece of text around the first match */
const excerptAround = (text: string, query: string) => {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return text.slice(0, EXCERPT_RADIUS * 2);
  const start = Math.max(index - EXCERPT_RADIUS, 0);
  const end = Math.min(index + query.length + EXCERPT_RADIUS, text.length);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
};

/**
 * GET /search?q=&limit= — projects, tasks and notes the user can access.
 * Results are limited per type (default 5, max 10).
 */
export const globalSearch = asyncHandler(async (req, res) => {
  const currentUser = requireUser(req);
  const q =
    typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 10);

  if (q.length < MIN_QUERY_LENGTH) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { query: q, projects: [], tasks: [], notes: [] },
          "Search",
        ),
      );
  }

  const projectIds = await ProjectMember.distinct("project", {
    user: currentUser._id,
  });
  const regex = searchRegex(q);

  const [projects, tasks, notes] = await Promise.all([
    Project.find(
      {
        _id: { $in: projectIds },
        $or: [{ name: regex }, { description: regex }],
      },
      "_id name description updatedAt",
    )
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean(),
    Task.aggregate([
      {
        $match: {
          project: { $in: projectIds },
          $or: [{ title: regex }, { description: regex }, { labels: regex }],
        },
      },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
      ...lookupProjectName,
      {
        $project: {
          _id: 1,
          title: 1,
          status: 1,
          priority: { $ifNull: ["$priority", "medium"] },
          dueDate: 1,
          project: 1,
        },
      },
    ]),
    ProjectNote.aggregate([
      { $match: { project: { $in: projectIds }, contentText: regex } },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
      ...lookupProjectName,
      { $project: { _id: 1, contentText: 1, updatedAt: 1, project: 1 } },
    ]),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        query: q,
        projects,
        tasks,
        notes: notes.map(({ contentText, ...note }) => ({
          ...note,
          excerpt: excerptAround(contentText ?? "", q),
        })),
      },
      "Search results",
    ),
  );
});
