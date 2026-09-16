import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { tasksApi } from "@/features/tasks/api";
import { queryKeys } from "@/lib/query-keys";
import type { SortOrder } from "@/types/models";

const COMMENTS_PAGE_SIZE = 10;

/** A task's comments, newest first by default, 10 at a time */
export function useTaskComments(
  projectId: string,
  taskId: string,
  order: SortOrder = "desc",
) {
  const params = { order, limit: COMMENTS_PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: queryKeys.tasks.commentPage(projectId, taskId, params),
    queryFn: ({ pageParam }) =>
      tasksApi
        .comments(projectId, taskId, { ...params, page: pageParam })
        .then((res) => res.data),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.hasNextPage ? last.pagination.page + 1 : undefined,
  });
}

/** Comments list + the comment count shown on board cards */
function useInvalidateComments(projectId: string, taskId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.comments(projectId, taskId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.columns(projectId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.activity(projectId, taskId),
      }),
    ]);
}

export function useAddComment(projectId: string, taskId: string) {
  const invalidate = useInvalidateComments(projectId, taskId);
  return useMutation({
    mutationFn: (body: string) =>
      tasksApi.addComment(projectId, taskId, body).then((res) => res.data),
    onSuccess: invalidate,
  });
}

export function useUpdateComment(projectId: string, taskId: string) {
  const invalidate = useInvalidateComments(projectId, taskId);
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      tasksApi
        .updateComment(projectId, commentId, body)
        .then((res) => res.data),
    onSuccess: invalidate,
  });
}

export function useDeleteComment(projectId: string, taskId: string) {
  const invalidate = useInvalidateComments(projectId, taskId);
  return useMutation({
    mutationFn: (commentId: string) =>
      tasksApi.removeComment(projectId, commentId),
    meta: { successMessage: "Comment deleted" },
    onSuccess: invalidate,
  });
}
