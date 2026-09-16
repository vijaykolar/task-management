import { ArrowDownUpIcon, MessageSquareIcon } from "lucide-react";
import { useState } from "react";

import { UserAvatar } from "@/components/common/user-avatar";
import { RichTextContent } from "@/components/rich-text/rich-text-content";
import { RichTextEditor } from "@/components/rich-text/lazy-rich-text-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { MentionItem } from "@/components/rich-text/mention-list";
import { useCurrentUser } from "@/features/auth/hooks";
import { useMemberOptions } from "@/features/projects/hooks";
import {
  useAddComment,
  useDeleteComment,
  useTaskComments,
  useUpdateComment,
} from "@/features/tasks/comment-hooks";
import { displayName, formatDate, formatRelative } from "@/lib/format";
import { isRichTextEmpty, richTextToPlainText } from "@/lib/rich-text";
import type { SortOrder, TaskComment, UserRole } from "@/types/models";

// Mirrors commentValidator() in backend/src/validators/index.ts
const MAX_COMMENT_CHARS = 5000;

function validateComment(html: string) {
  if (isRichTextEmpty(html)) return "Write something first";
  if (richTextToPlainText(html).length > MAX_COMMENT_CHARS) {
    return `Comments can be at most ${MAX_COMMENT_CHARS.toLocaleString()} characters`;
  }
  return null;
}

interface TaskCommentsProps {
  projectId: string;
  taskId: string;
  role: UserRole | undefined;
}

/** Jira-style comment thread for a task */
export function TaskComments({ projectId, taskId, role }: TaskCommentsProps) {
  const { data: currentUser } = useCurrentUser();
  const [order, setOrder] = useState<SortOrder>("desc");
  const comments = useTaskComments(projectId, taskId, order);
  const [deleting, setDeleting] = useState<TaskComment | null>(null);
  const deleteComment = useDeleteComment(projectId, taskId);

  const items = comments.data?.pages.flatMap((page) => page.items) ?? [];
  const total = comments.data?.pages[0]?.pagination.total ?? 0;
  const canModerate = role === "admin" || role === "project_admin";

  const composer = currentUser && (
    <CommentComposer projectId={projectId} taskId={taskId} />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {comments.isSuccess
            ? total === 1
              ? "1 comment"
              : `${total} comments`
            : "Loading comments…"}
        </p>
        {total > 1 && (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => setOrder(order === "desc" ? "asc" : "desc")}
          >
            <ArrowDownUpIcon />
            {order === "desc" ? "Newest first" : "Oldest first"}
          </Button>
        )}
      </div>

      {/* Jira puts the composer above newest-first threads */}
      {order === "desc" && composer}

      {comments.isPending && (
        <div className="space-y-4">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {comments.isSuccess && total === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <MessageSquareIcon className="size-4" />
          No comments yet. Start the conversation.
        </div>
      )}

      <ul className="space-y-5">
        {items.map((comment) => (
          <CommentItem
            key={comment._id}
            projectId={projectId}
            taskId={taskId}
            comment={comment}
            canEdit={comment.author?._id === currentUser?._id}
            canDelete={comment.author?._id === currentUser?._id || canModerate}
            onDelete={() => setDeleting(comment)}
          />
        ))}
      </ul>

      {comments.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => comments.fetchNextPage()}
          disabled={comments.isFetchingNextPage}
        >
          {comments.isFetchingNextPage && <Spinner />}
          Show {Math.min(10, total - items.length)} more of{" "}
          {total - items.length} older comments
        </Button>
      )}

      {order === "asc" && composer}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This comment will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteComment.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteComment.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!deleting) return;
                deleteComment.mutate(deleting._id, {
                  onSuccess: () => setDeleting(null),
                });
              }}
            >
              {deleteComment.isPending && <Spinner />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Project members matching an @query, by username or name */
function useMentionItems(projectId: string) {
  const members = useMemberOptions(projectId);
  return (query: string): MentionItem[] => {
    const term = query.toLowerCase();
    return (members.data?.items ?? [])
      .filter(
        ({ user }) =>
          user.username.toLowerCase().includes(term) ||
          (user.fullName ?? "").toLowerCase().includes(term),
      )
      .slice(0, 6)
      .map(({ user }) => ({ id: user._id, label: user.username, user }));
  };
}

function CommentComposer({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const mentionItems = useMentionItems(projectId);
  const { data: currentUser } = useCurrentUser();
  const addComment = useAddComment(projectId, taskId);
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Remounting the editor is the simplest way to clear it
  const [editorKey, setEditorKey] = useState(0);

  const reset = () => {
    setBody("");
    setError(null);
    setExpanded(false);
    setEditorKey((key) => key + 1);
  };

  const submit = () => {
    const problem = validateComment(body);
    if (problem) {
      setError(problem);
      return;
    }
    addComment.mutate(body, {
      onSuccess: reset,
      onError: (err) => setError(err.message),
    });
  };

  if (!currentUser) return null;

  return (
    <div className="flex gap-3">
      <UserAvatar user={currentUser} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-2">
        {expanded ? (
          <>
            <RichTextEditor
              key={editorKey}
              value=""
              onChange={(html) => {
                setBody(html);
                setError(null);
              }}
              placeholder="Add a comment… Type @ to mention someone"
              aria-label="New comment"
              mentionItems={mentionItems}
              autoFocus
              invalid={!!error}
              disabled={addComment.isPending}
              onSubmitShortcut={submit}
              contentClassName="min-h-24"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={submit}
                disabled={addComment.isPending}
              >
                {addComment.isPending && <Spinner />}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={reset}
                disabled={addComment.isPending}
              >
                Cancel
              </Button>
              <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
                Ctrl + Enter to save
              </span>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full rounded-lg border border-input px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 dark:bg-input/30"
          >
            Add a comment…
          </button>
        )}
      </div>
    </div>
  );
}

function CommentItem({
  projectId,
  taskId,
  comment,
  canEdit,
  canDelete,
  onDelete,
}: {
  projectId: string;
  taskId: string;
  comment: TaskComment;
  canEdit: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const updateComment = useUpdateComment(projectId, taskId);
  const mentionItems = useMentionItems(projectId);
  const [isEditing, setIsEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const problem = validateComment(body);
    if (problem) {
      setError(problem);
      return;
    }
    updateComment.mutate(
      { commentId: comment._id, body },
      {
        onSuccess: () => setIsEditing(false),
        onError: (err) => setError(err.message),
      },
    );
  };

  return (
    <li className="flex gap-3">
      {comment.author ? (
        <UserAvatar user={comment.author} className="mt-0.5" />
      ) : (
        <span className="mt-0.5 size-8 shrink-0 rounded-full bg-muted" />
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">
            {comment.author ? displayName(comment.author) : "Former member"}
          </span>
          <time
            className="text-xs text-muted-foreground"
            dateTime={comment.createdAt}
            title={formatDate(comment.createdAt)}
          >
            {formatRelative(comment.createdAt)}
          </time>
          {comment.editedAt && (
            <span
              className="text-xs text-muted-foreground"
              title={`Edited ${formatRelative(comment.editedAt)}`}
            >
              (edited)
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <RichTextEditor
              value={comment.body}
              onChange={(html) => {
                setBody(html);
                setError(null);
              }}
              aria-label="Edit comment"
              mentionItems={mentionItems}
              autoFocus
              invalid={!!error}
              disabled={updateComment.isPending}
              onSubmitShortcut={save}
              contentClassName="min-h-20"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={save}
                disabled={updateComment.isPending}
              >
                {updateComment.isPending && <Spinner />}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setBody(comment.body);
                  setError(null);
                }}
                disabled={updateComment.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <RichTextContent html={comment.body} />
            {(canEdit || canDelete) && (
              <div className="flex gap-3 text-xs">
                {canEdit && (
                  <button
                    type="button"
                    className="font-medium text-muted-foreground hover:text-foreground hover:underline"
                    onClick={() => {
                      setBody(comment.body);
                      setIsEditing(true);
                    }}
                  >
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="font-medium text-muted-foreground hover:text-destructive hover:underline"
                    onClick={onDelete}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
