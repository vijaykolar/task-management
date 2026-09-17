import { AlignLeftIcon, PencilIcon } from "lucide-react";
import { useState } from "react";

import { RichTextContent } from "@/components/rich-text/rich-text-content";
import { RichTextEditor } from "@/components/rich-text/lazy-rich-text-editor";
import {
  useImageUploads,
  useMentionItems,
} from "@/components/rich-text/use-rich-text-helpers";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useUpdateTask } from "@/features/tasks/hooks";
import { MAX_DESCRIPTION_CHARS } from "@/features/tasks/schemas";
import { isRichTextEmpty, richTextToPlainText } from "@/lib/rich-text";

/**
 * A task's rich text description. People who manage tasks click it to edit in
 * place; pasted or dropped images land where the cursor is.
 */
export function TaskDescription({
  projectId,
  taskId,
  description,
  canEdit,
}: {
  projectId: string;
  taskId: string;
  /** Sanitized HTML; missing = no description */
  description?: string;
  canEdit: boolean;
}) {
  const updateTask = useUpdateTask(projectId);
  const mentionItems = useMentionItems(projectId);
  const images = useImageUploads(projectId);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(description ?? "");
  const [error, setError] = useState<string | null>(null);

  const hasDescription = !!description && !isRichTextEmpty(description);

  const startEditing = () => {
    setDraft(description ?? "");
    setError(null);
    setIsEditing(true);
  };

  const save = () => {
    if (images.uploading > 0) return;
    if (richTextToPlainText(draft).length > MAX_DESCRIPTION_CHARS) {
      setError(
        `Keep the description under ${MAX_DESCRIPTION_CHARS.toLocaleString()} characters`,
      );
      return;
    }
    const next = isRichTextEmpty(draft) ? "" : draft;
    if (next === (description ?? "")) {
      setIsEditing(false);
      return;
    }
    updateTask.mutate(
      { taskId, description: next },
      {
        onSuccess: () => setIsEditing(false),
        onError: (err) => setError(err.message),
      },
    );
  };

  if (isEditing) {
    const busy = updateTask.isPending || images.uploading > 0;
    return (
      <div className="space-y-2">
        <RichTextEditor
          value={description ?? ""}
          onChange={(html) => {
            setDraft(html);
            setError(null);
          }}
          aria-label="Description"
          placeholder="Add context, acceptance criteria, links… Type @ to mention someone or paste a screenshot"
          mentionItems={mentionItems}
          {...images.editorProps}
          autoFocus
          invalid={!!error}
          disabled={updateTask.isPending}
          onSubmitShortcut={save}
          contentClassName="max-h-[50svh] min-h-32 overflow-y-auto"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={busy}>
            {busy && <Spinner />}
            {images.uploading > 0 ? "Uploading image…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsEditing(false)}
            disabled={updateTask.isPending}
          >
            Cancel
          </Button>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
            Ctrl + Enter to save
          </span>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex min-h-7 items-center gap-2">
        <AlignLeftIcon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Description</h3>
        {canEdit && hasDescription && (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto text-muted-foreground"
            onClick={startEditing}
          >
            <PencilIcon />
            Edit
          </Button>
        )}
      </div>
      {hasDescription ? (
        <RichTextContent
          html={description!}
          className={
            canEdit
              ? "-mx-2 cursor-text rounded-md px-2 py-1 transition-colors hover:bg-muted/50"
              : undefined
          }
          onDoubleClick={canEdit ? startEditing : undefined}
        />
      ) : canEdit ? (
        <button
          type="button"
          onClick={startEditing}
          className="w-full rounded-lg border border-dashed px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50"
        >
          Add a description…
        </button>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No description provided.
        </p>
      )}
    </section>
  );
}
