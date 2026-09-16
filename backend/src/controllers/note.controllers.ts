import { type PipelineStage } from "mongoose";
import { ProjectNote } from "../models/note.models.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { toObjectId } from "../utils/object-id.js";
import { requireUser } from "../utils/request-user.js";
import { prepareRichText } from "../utils/rich-text.js";
import {
  facetPage,
  fromFacet,
  parseListQuery,
  searchRegex,
} from "../utils/pagination.js";

type ProjectParams = { projectId: string };
type NoteParams = ProjectParams & { noteId: string };

const withCreator: PipelineStage[] = [
  {
    $lookup: {
      from: "users",
      localField: "createdBy",
      foreignField: "_id",
      as: "createdBy",
      pipeline: [{ $project: { _id: 1, username: 1, fullName: 1, avatar: 1 } }],
    },
  },
  { $addFields: { createdBy: { $arrayElemAt: ["$createdBy", 0] } } },
];

const NOTE_SORT_FIELDS = ["updatedAt", "createdAt"] as const;

/** GET /notes/:projectId?page&limit&sort=updatedAt|createdAt&order&search */
const getNotes = asyncHandler<ProjectParams>(async (req, res) => {
  const query = parseListQuery(req.query, {
    sortFields: NOTE_SORT_FIELDS,
    defaultSort: "updatedAt",
    defaultLimit: 12,
    maxLimit: 50,
  });

  const result = await ProjectNote.aggregate([
    {
      $match: {
        project: toObjectId(req.params.projectId, "project id"),
        ...(query.search && { contentText: searchRegex(query.search) }),
      },
    },
    { $sort: { [query.sortField]: query.sortOrder, _id: 1 } },
    facetPage(
      query,
      withCreator as NonNullable<PipelineStage.Facet["$facet"][string]>,
    ),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        fromFacet(result, query),
        "Notes fetched successfully",
      ),
    );
});

const getNoteById = asyncHandler<NoteParams>(async (req, res) => {
  const { projectId, noteId } = req.params;

  const notes = await ProjectNote.aggregate([
    {
      $match: {
        _id: toObjectId(noteId, "note id"),
        project: toObjectId(projectId, "project id"),
      },
    },
    ...withCreator,
  ]);

  if (!notes[0]) {
    throw new ApiError(404, "Note not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, notes[0], "Note fetched successfully"));
});

const createNote = asyncHandler<ProjectParams>(async (req, res) => {
  const currentUser = requireUser(req);
  const { html, text } = prepareRichText(req.body.content);

  const note = await ProjectNote.create({
    project: toObjectId(req.params.projectId, "project id"),
    createdBy: currentUser._id,
    content: html,
    contentText: text,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, note, "Note created successfully"));
});

const updateNote = asyncHandler<NoteParams>(async (req, res) => {
  const { projectId, noteId } = req.params;
  const { html, text } = prepareRichText(req.body.content);

  const note = await ProjectNote.findOneAndUpdate(
    {
      _id: toObjectId(noteId, "note id"),
      project: toObjectId(projectId, "project id"),
    },
    { content: html, contentText: text },
    { new: true },
  );

  if (!note) {
    throw new ApiError(404, "Note not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, note, "Note updated successfully"));
});

const deleteNote = asyncHandler<NoteParams>(async (req, res) => {
  const { projectId, noteId } = req.params;

  const note = await ProjectNote.findOneAndDelete({
    _id: toObjectId(noteId, "note id"),
    project: toObjectId(projectId, "project id"),
  });

  if (!note) {
    throw new ApiError(404, "Note not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, note, "Note deleted successfully"));
});

export { createNote, deleteNote, getNoteById, getNotes, updateNote };
