import { http } from "@/lib/axios";
import type { ListParams, Note, Paginated } from "@/types/models";

export type NoteSort = "updatedAt" | "createdAt";
export type NoteListParams = ListParams<NoteSort>;

// Endpoints under /api/v1/notes — see backend/src/routes/note.routes.ts
export const notesApi = {
  list: (projectId: string, params: NoteListParams = {}) =>
    http.get<Paginated<Note>>(`/notes/${projectId}`, { params }),

  get: (projectId: string, noteId: string) =>
    http.get<Note>(`/notes/${projectId}/n/${noteId}`),

  create: (projectId: string, content: string) =>
    http.post<Note>(`/notes/${projectId}`, { content }),

  update: (projectId: string, noteId: string, content: string) =>
    http.put<Note>(`/notes/${projectId}/n/${noteId}`, { content }),

  remove: (projectId: string, noteId: string) =>
    http.delete<Note>(`/notes/${projectId}/n/${noteId}`),
};
