import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";

import { FormAlert } from "@/components/common/form-alert";
import { RichTextEditor } from "@/components/rich-text/lazy-rich-text-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useCreateNote, useUpdateNote } from "@/features/notes/hooks";
import {
  MAX_NOTE_CHARS,
  noteSchema,
  type NoteValues,
} from "@/features/notes/schemas";
import { richTextToPlainText } from "@/lib/rich-text";
import { applyServerFieldErrors } from "@/lib/form-errors";
import type { Note } from "@/types/models";

interface NoteFormDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a note to edit it; omit to create */
  note?: Pick<Note, "_id" | "content">;
}

export function NoteFormDialog({
  open,
  onOpenChange,
  ...props
}: NoteFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {/* Mounted only while open, so form + mutation state start fresh */}
        <NoteForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NoteForm({
  projectId,
  note,
  onDone,
}: Omit<NoteFormDialogProps, "open" | "onOpenChange"> & {
  onDone: () => void;
}) {
  const isEdit = !!note;
  const createNote = useCreateNote(projectId);
  const updateNote = useUpdateNote(projectId);
  const mutation = isEdit ? updateNote : createNote;

  const form = useForm<NoteValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: { content: note?.content ?? "" },
  });
  const length = richTextToPlainText(
    useWatch({ control: form.control, name: "content" }),
  ).length;

  const onSubmit = form.handleSubmit(({ content }) => {
    const options = {
      onSuccess: onDone,
      onError: (error: unknown) =>
        applyServerFieldErrors(error, form.setError, ["content"]),
    };
    if (note) {
      updateNote.mutate({ noteId: note._id, content }, options);
    } else {
      createNote.mutate(content, options);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit note" : "New note"}</DialogTitle>
        <DialogDescription>
          Notes are visible to everyone in the project.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="py-6">
        <Controller
          control={form.control}
          name="content"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="note-content" className="sr-only">
                Content
              </FieldLabel>
              <RichTextEditor
                id="note-content"
                aria-label="Note content"
                value={field.value}
                onChange={field.onChange}
                placeholder="Meeting notes, decisions, links, reminders…"
                invalid={fieldState.invalid}
                autoFocus
                onSubmitShortcut={onSubmit}
                contentClassName="max-h-[50svh] min-h-56 overflow-y-auto"
              />
              {fieldState.error ? (
                <FieldError errors={[fieldState.error]} />
              ) : (
                <FieldDescription className="text-right tabular-nums">
                  {length.toLocaleString()}/{MAX_NOTE_CHARS.toLocaleString()} ·
                  Ctrl + Enter to save
                </FieldDescription>
              )}
            </Field>
          )}
        />
        <FormAlert
          message={
            mutation.error?.statusCode !== 422 ? mutation.error?.message : null
          }
        />
      </FieldGroup>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Spinner />}
          {isEdit ? "Save note" : "Add note"}
        </Button>
      </DialogFooter>
    </form>
  );
}
