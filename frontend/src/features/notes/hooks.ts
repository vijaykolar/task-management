import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";

import { notesApi, type NoteListParams } from "@/features/notes/api";
import { queryKeys } from "@/lib/query-keys";
import type { Note, Paginated } from "@/types/models";

type NotePages = InfiniteData<Paginated<Note>, number>;

const NOTES_PAGE_SIZE = 12;

/** Notes loaded 12 at a time ("Load more") */
export function useNotes(
  projectId: string | undefined,
  params: Omit<NoteListParams, "page" | "limit"> = {},
) {
  const query = { ...params, limit: NOTES_PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: queryKeys.notes.list(projectId ?? "", query),
    queryFn: ({ pageParam }) =>
      notesApi
        .list(projectId!, { ...query, page: pageParam })
        .then((res) => res.data),
    enabled: !!projectId,
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.hasNextPage ? last.pagination.page + 1 : undefined,
  });
}

export function useNote(projectId: string, noteId: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.notes.detail(projectId, noteId ?? ""),
    queryFn: () => notesApi.get(projectId, noteId!).then((res) => res.data),
    enabled: !!noteId,
    placeholderData: () =>
      queryClient
        .getQueriesData<NotePages>({
          queryKey: queryKeys.notes.lists(projectId),
        })
        .flatMap(([, data]) => data?.pages ?? [])
        .flatMap((page) => page.items)
        .find((note) => note._id === noteId),
  });
}

function useInvalidateNotes(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.notes.project(projectId),
    });
}

export function useCreateNote(projectId: string) {
  const invalidate = useInvalidateNotes(projectId);
  return useMutation({
    mutationFn: (content: string) =>
      notesApi.create(projectId, content).then((res) => res.data),
    meta: { silent: true, successMessage: "Note added" },
    onSuccess: invalidate,
  });
}

export function useUpdateNote(projectId: string) {
  const invalidate = useInvalidateNotes(projectId);
  return useMutation({
    mutationFn: ({ noteId, content }: { noteId: string; content: string }) =>
      notesApi.update(projectId, noteId, content).then((res) => res.data),
    meta: { silent: true, successMessage: "Note updated" },
    onSuccess: invalidate,
  });
}

export function useDeleteNote(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateNotes(projectId);
  return useMutation({
    mutationFn: (noteId: string) => notesApi.remove(projectId, noteId),
    meta: { successMessage: "Note deleted" },
    onSuccess: (_data, noteId) => {
      queryClient.removeQueries({
        queryKey: queryKeys.notes.detail(projectId, noteId),
      });
      return invalidate();
    },
  });
}
